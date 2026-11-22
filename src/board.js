import { createDesk, spreadPieces } from './desk.js';
import { createSnapSound } from './sound.js?v=card-on-wood';
import { createPuzzle, piecePath, shuffled, targetFor } from './puzzle.js?v=quiet-gallery';

const $ = (id) => document.getElementById(id);
const board = $('board');
const dragLayer = $('drag-layer');
const hitContext = document.createElement('canvas').getContext('2d');
const sound = createSnapSound();
const zoomLevels = [1, 1.35, 1.8, 2.4, 3.2];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function fitCanvas(canvas, width, height) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

function paintPiece(context, image, piece, path, x, y, scale, stroke, shadow = false, lineWidth = 1) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  if (shadow) {
    context.shadowColor = '#272d2670';
    context.shadowBlur = 6;
    context.shadowOffsetY = 2;
    context.fillStyle = '#f4f2e9';
    context.fill(path);
    context.shadowColor = 'transparent';
  }
  context.save();
  context.clip(path);
  context.drawImage(image, -piece.x, -piece.y, image.naturalWidth, image.naturalHeight);
  context.restore();
  context.lineWidth = lineWidth / scale;
  context.strokeStyle = stroke;
  context.stroke(path);
  context.restore();
}

export class PuzzleBoard {
  constructor(game, image, onChange) {
    this.game = game;
    this.image = image;
    this.onChange = onChange;
    this.puzzle = createPuzzle(image.naturalWidth, image.naturalHeight, game.level, game.seed);
    this.paths = this.puzzle.pieces.map((piece) => piecePath(this.puzzle, piece));
    this.placed = new Set(game.placed);
    this.loose = new Map(game.loose);
    this.order = game.order;
    this.positions = new Map();
    this.selected = null;
    this.pointer = null;
    this.keyboardCell = null;
    this.guide = false;
    this.edges = false;
    this.zoomIndex = 0;
    this.pan = { x: 0, y: 0 };
    this.listeners = new AbortController();
    const listen = (node, name, action, options) => node.addEventListener(name, action, { ...options, signal: this.listeners.signal });

    $('toggle-guide').setAttribute('aria-pressed', 'false');
    $('toggle-edges').setAttribute('aria-pressed', 'false');
    this.refreshSound();
    listen($('toggle-guide'), 'click', () => {
      this.guide = !this.guide;
      $('toggle-guide').setAttribute('aria-pressed', String(this.guide));
      this.render();
    });
    listen($('toggle-edges'), 'click', () => {
      this.edges = !this.edges;
      $('toggle-edges').setAttribute('aria-pressed', String(this.edges));
      this.select(null);
      this.render();
    });
    listen($('shuffle'), 'click', () => {
      this.loose.clear();
      this.order = shuffled(this.order);
      this.resetScatter();
      this.select(null);
      this.update();
    });
    listen($('toggle-sound'), 'click', () => {
      sound.toggle();
      this.refreshSound();
    });
    listen($('zoom-out'), 'click', () => this.setZoom(this.zoomIndex - 1));
    listen($('zoom-in'), 'click', () => this.setZoom(this.zoomIndex + 1));
    listen($('zoom-reset'), 'click', () => this.setZoom(0));
    listen(board, 'wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (this.pointer || Math.abs(event.deltaY) < 1 || event.timeStamp < (this.nextWheelZoom ?? 0)) return;
      this.nextWheelZoom = event.timeStamp + 140;
      const rect = board.getBoundingClientRect();
      this.setZoom(this.zoomIndex + (event.deltaY < 0 ? 1 : -1), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }, { passive: false });
    listen(board, 'pointerdown', (event) => this.press(event));
    listen(board, 'pointermove', (event) => this.move(event));
    listen(board, 'pointerup', (event) => this.release(event));
    listen(board, 'pointercancel', (event) => this.cancel(event));
    listen(board, 'lostpointercapture', (event) => this.cancel(event));
    listen(window, 'blur', () => this.cancel());
    listen(board, 'keydown', (event) => this.onKey(event));
    listen(board, 'blur', () => {
      this.keyboardCell = null;
      this.render();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(board);
    this.refreshProgress();
    this.refreshZoom();
  }

  destroy() {
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.cancel();
    cancelAnimationFrame(this.animation);
    board.style.cursor = '';
  }

  get done() {
    return this.placed.size === this.puzzle.pieces.length;
  }

  refreshProgress() {
    $('game-count').textContent = this.placed.size + ' of ' + this.puzzle.pieces.length;
    $('game-progress').max = this.puzzle.pieces.length;
    $('game-progress').value = this.placed.size;
    $('toggle-guide').disabled = this.done;
    $('toggle-edges').disabled = this.done;
    $('shuffle').disabled = this.done;
  }

  refreshSound() {
    const button = $('toggle-sound');
    button.setAttribute('aria-pressed', String(sound.enabled));
    button.querySelector('use').setAttribute('href', sound.enabled ? '#i-sound' : '#i-muted');
  }

  refreshZoom() {
    $('zoom-out').disabled = this.done || this.zoomIndex === 0;
    $('zoom-in').disabled = this.done || this.zoomIndex === zoomLevels.length - 1;
    const percent = Math.round(zoomLevels[this.zoomIndex] * 100) + '%';
    $('zoom-reset').textContent = percent;
    $('zoom-reset').setAttribute('aria-label', 'reset zoom, currently ' + percent);
    $('zoom-reset').disabled = this.done || this.zoomIndex === 0;
  }

  resize() {
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (!width || !height) return;
    if (!this.layout || width !== this.layout.width || height !== this.layout.height) {
      this.desk = createDesk(this.puzzle, width, height);
      this.layout = { width, height };
      this.resetScatter();
    }
    this.updateViewport();
  }

  resetScatter() {
    this.positions = spreadPieces(this.desk, this.order, this.game.seed);
    for (const id of this.placed) this.positions.delete(id);
    for (const [id, position] of this.loose) {
      if (this.placed.has(id)) continue;
      this.positions.delete(id);
      this.positions.set(id, this.withinDesk(position));
    }
  }

  withinDesk({ x, y }) {
    const { left, right, top, bottom, inset } = this.desk;
    return {
      x: clamp(x, left + inset, right - inset - this.puzzle.cellWidth),
      y: clamp(y, top + inset, bottom - inset - this.puzzle.cellHeight),
    };
  }

  setZoom(index, anchor) {
    if (!this.layout || this.pointer || this.done) return;
    const nextIndex = clamp(index, 0, zoomLevels.length - 1);
    if (nextIndex === this.zoomIndex) return;
    const ratio = zoomLevels[nextIndex] / zoomLevels[this.zoomIndex];
    const { width, height } = this.layout;
    const x = (anchor?.x ?? width / 2) - width / 2;
    const y = (anchor?.y ?? height / 2) - height / 2;
    this.pan = { x: x - (x - this.pan.x) * ratio, y: y - (y - this.pan.y) * ratio };
    this.zoomIndex = nextIndex;
    this.refreshZoom();
    this.updateViewport();
    board.style.cursor = nextIndex ? 'grab' : '';
  }

  updateViewport() {
    const { width, height } = this.layout;
    const zoom = zoomLevels[this.zoomIndex];
    const maxX = width * (zoom - 1) / 2;
    const maxY = height * (zoom - 1) / 2;
    this.pan.x = clamp(this.pan.x, -maxX, maxX);
    this.pan.y = clamp(this.pan.y, -maxY, maxY);
    const scale = this.desk.scale * zoom;
    Object.assign(this.layout, {
      x: (width - this.puzzle.width * scale) / 2 + this.pan.x,
      y: (height - this.puzzle.height * scale) / 2 + this.pan.y,
      scale,
    });
    this.render();
  }

  render() {
    if (!this.layout || !board.clientWidth) return;
    const { x, y, width, height, scale } = this.layout;
    const { width: imageWidth, height: imageHeight, cellWidth, cellHeight, cols, rows } = this.puzzle;
    const context = fitCanvas(board, width, height);
    if (this.done) {
      const fit = Math.min(width * .86 / imageWidth, height * .87 / imageHeight);
      const w = imageWidth * fit;
      const h = imageHeight * fit;
      context.drawImage(this.image, (width - w) / 2, (height - h) / 2, w, h);
      return;
    }

    const w = imageWidth * scale;
    const h = imageHeight * scale;
    context.save();
    context.shadowColor = '#30342b38';
    context.shadowBlur = 14;
    context.shadowOffsetY = 3;
    context.fillStyle = '#f2f1e9';
    context.fillRect(x, y, w, h);
    context.restore();
    if (this.guide) {
      context.globalAlpha = .38;
      context.drawImage(this.image, x, y, w, h);
      context.globalAlpha = 1;
    }
    context.strokeStyle = '#576157a0';
    context.lineWidth = 1;
    context.strokeRect(x, y, w, h);
    context.save();
    context.lineWidth = 1.4;
    context.lineCap = 'round';
    context.strokeStyle = '#687369a0';
    context.beginPath();
    context.setLineDash([0, 5]);
    for (let col = 1; col < cols; col += 1) {
      const at = x + col * cellWidth * scale;
      context.moveTo(at, y);
      context.lineTo(at, y + h);
    }
    for (let row = 1; row < rows; row += 1) {
      const at = y + row * cellHeight * scale;
      context.moveTo(x, at);
      context.lineTo(x + w, at);
    }
    context.stroke();
    context.restore();
    for (const id of this.placed) {
      const piece = this.puzzle.pieces[id];
      paintPiece(context, this.image, piece, this.paths[id], x + piece.x * scale, y + piece.y * scale, scale, '#282e287d', false, .75);
    }
    const pad = this.desk.inset * scale + 9;
    for (const [id, position] of this.positions) {
      if (!this.visiblePiece(id) || (this.pointer?.dragging && this.pointer.id === id)) continue;
      const left = x + position.x * scale;
      const top = y + position.y * scale;
      if (left - pad > width || left + cellWidth * scale + pad < 0 || top - pad > height || top + cellHeight * scale + pad < 0) continue;
      const selected = id === this.selected;
      paintPiece(context, this.image, this.puzzle.pieces[id], this.paths[id], left, top, scale, selected ? '#354d49' : '#282e28bd', true, selected ? 2 : .9);
    }
    if (this.keyboardCell !== null) {
      const cell = this.puzzle.pieces[this.keyboardCell];
      context.lineWidth = 2;
      context.strokeStyle = '#34554e';
      context.strokeRect(x + cell.x * scale + 1, y + cell.y * scale + 1, cellWidth * scale - 2, cellHeight * scale - 2);
    }
  }

  visiblePiece(id) {
    return !this.edges || this.puzzle.pieces[id].border;
  }

  select(id) {
    this.selected = id;
    $('game-feedback').textContent = id === null ? '' : 'selected piece ' + (id + 1) + '.';
  }

  worldAt(clientX, clientY) {
    const rect = board.getBoundingClientRect();
    const { x, y, scale } = this.layout;
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale };
  }

  insidePicture({ x, y }) {
    return x >= 0 && y >= 0 && x < this.puzzle.width && y < this.puzzle.height;
  }

  cellAt({ x, y }) {
    const { cellWidth, cellHeight, cols } = this.puzzle;
    return Math.floor(x / cellWidth) + Math.floor(y / cellHeight) * cols;
  }

  findPiece(point) {
    const { cellWidth, cellHeight } = this.puzzle;
    const pad = this.desk.inset;
    let hit;
    for (const [id, position] of this.positions) {
      if (!this.visiblePiece(id)) continue;
      const x = point.x - position.x;
      const y = point.y - position.y;
      if (x < -pad || y < -pad || x > cellWidth + pad || y > cellHeight + pad) continue;
      if (hitContext.isPointInPath(this.paths[id], x, y)) hit = id;
    }
    return hit;
  }

  tryCell(cell) {
    if (this.selected === null) return;
    const piece = this.puzzle.pieces[cell];
    if (this.place(this.selected, piece.x, piece.y)) return;
    $('game-feedback').textContent = 'this piece does not fit here.';
  }

  onKey(event) {
    if (!this.layout || this.done) return;
    const { cols, rows } = this.puzzle;
    const start = this.keyboardCell ?? 0;
    let row = Math.floor(start / cols);
    let col = start % cols;
    switch (event.key) {
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'ArrowDown': row = Math.min(rows - 1, row + 1); break;
      case 'ArrowLeft': col = Math.max(0, col - 1); break;
      case 'ArrowRight': col = Math.min(cols - 1, col + 1); break;
      case 'PageUp': this.cycleSelection(-1); break;
      case 'PageDown': this.cycleSelection(1); break;
      case 'Enter':
      case ' ': this.selected === null ? this.cycleSelection(1) : this.tryCell(start); break;
      case '+':
      case '=': this.setZoom(this.zoomIndex + 1); break;
      case '-': this.setZoom(this.zoomIndex - 1); break;
      case '0': this.setZoom(0); break;
      case 'Escape': this.select(null); break;
      default: return;
    }
    event.preventDefault();
    this.keyboardCell = row * cols + col;
    if (this.zoomIndex) this.revealCell(this.keyboardCell);
    this.render();
  }

  cycleSelection(direction) {
    const ids = this.order.filter((id) => this.positions.has(id) && this.visiblePiece(id));
    if (!ids.length) return;
    const index = ids.indexOf(this.selected);
    const next = index === -1 ? (direction > 0 ? 0 : ids.length - 1) : (index + direction + ids.length) % ids.length;
    this.select(ids[next]);
  }

  revealCell(id) {
    const cell = this.puzzle.pieces[id];
    const { x, y, width, height, scale } = this.layout;
    const left = x + cell.x * scale;
    const top = y + cell.y * scale;
    const targetX = clamp(left, 10, Math.max(10, width - 10 - this.puzzle.cellWidth * scale));
    const targetY = clamp(top, 10, Math.max(10, height - 10 - this.puzzle.cellHeight * scale));
    if (targetX === left && targetY === top) return;
    this.pan.x += targetX - left;
    this.pan.y += targetY - top;
    this.updateViewport();
  }

  press(event) {
    if (this.pointer || !this.layout || this.done || event.button !== 0) return;
    const point = this.worldAt(event.clientX, event.clientY);
    const id = this.findPiece(point);
    const position = this.positions.get(id);
    this.pointer = {
      pointerId: event.pointerId,
      id,
      x: event.clientX,
      y: event.clientY,
      pan: { ...this.pan },
      offset: position ? { x: point.x - position.x, y: point.y - position.y } : null,
      dragging: false,
    };
    this.keyboardCell = null;
    board.focus({ preventScroll: true });
    board.setPointerCapture(event.pointerId);
  }

  move(event) {
    if (!this.layout || this.done) return;
    const pointer = this.pointer;
    if (!pointer) {
      if (event.pointerType === 'mouse') {
        const point = this.worldAt(event.clientX, event.clientY);
        board.style.cursor = this.findPiece(point) !== undefined ? 'grab'
          : (this.selected !== null && this.insidePicture(point) ? 'crosshair' : (this.zoomIndex ? 'grab' : ''));
      }
      return;
    }
    if (event.pointerId !== pointer.pointerId) return;
    if (!pointer.dragging && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 5) return;
    if (!pointer.dragging) {
      pointer.dragging = true;
      if (pointer.offset) {
        this.select(null);
        this.render();
      }
      board.style.cursor = this.zoomIndex || pointer.offset ? 'grabbing' : '';
    }
    if (!pointer.offset) {
      if (!this.zoomIndex) return;
      this.pan = { x: pointer.pan.x + event.clientX - pointer.x, y: pointer.pan.y + event.clientY - pointer.y };
      if (!this.animation) {
        this.animation = requestAnimationFrame(() => {
          this.animation = undefined;
          this.updateViewport();
        });
      }
      return;
    }
    this.drawDrag(event, pointer);
  }

  drawDrag(event, pointer) {
    const { scale } = this.layout;
    const padding = 12 + this.desk.inset * scale;
    if (dragLayer.hidden) {
      const { cellWidth, cellHeight } = this.puzzle;
      const width = Math.ceil(cellWidth * scale + padding * 2);
      const height = Math.ceil(cellHeight * scale + padding * 2);
      dragLayer.style.width = width + 'px';
      dragLayer.style.height = height + 'px';
      const context = fitCanvas(dragLayer, width, height);
      paintPiece(context, this.image, this.puzzle.pieces[pointer.id], this.paths[pointer.id], padding, padding, scale, '#282e28e0', true);
      dragLayer.hidden = false;
    }
    const left = event.clientX - pointer.offset.x * scale - padding;
    const top = event.clientY - pointer.offset.y * scale - padding;
    dragLayer.style.transform = 'translate(' + left + 'px, ' + top + 'px)';
  }

  release(event) {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    this.pointer = null;
    dragLayer.hidden = true;
    board.style.cursor = this.zoomIndex ? 'grab' : '';
    const point = this.worldAt(event.clientX, event.clientY);
    if (!pointer.dragging) {
      if (this.selected !== null && this.insidePicture(point) && pointer.id !== this.selected) {
        this.tryCell(this.cellAt(point));
      } else {
        this.select(pointer.id === this.selected ? null : (pointer.id ?? null));
        this.render();
      }
      return;
    }
    if (!pointer.offset) return;
    const rect = board.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
      this.render();
      return;
    }
    const x = point.x - pointer.offset.x;
    const y = point.y - pointer.offset.y;
    if (this.place(pointer.id, x, y)) return;
    const position = this.withinDesk({ x, y });
    this.loose.delete(pointer.id);
    this.loose.set(pointer.id, position);
    this.positions.delete(pointer.id);
    this.positions.set(pointer.id, position);
    this.update();
  }

  cancel(event) {
    if (event && event.pointerId !== this.pointer?.pointerId) return;
    this.pointer = null;
    dragLayer.hidden = true;
    board.style.cursor = this.zoomIndex ? 'grab' : '';
    this.render();
  }

  place(id, x, y) {
    if (!targetFor(this.puzzle, this.puzzle.pieces[id], x, y)) return false;
    this.placed.add(id);
    this.loose.delete(id);
    this.positions.delete(id);
    sound.play();
    this.select(null);
    this.update();
    return true;
  }

  update() {
    this.refreshProgress();
    this.refreshZoom();
    this.render();
    this.onChange({
      placed: [...this.placed],
      loose: [...this.loose],
      order: [...this.order],
    }, this.done);
  }
}
