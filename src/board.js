import { constrainPan, fitPuzzle } from './desk.js?v=piece-tray';
import { applyJigsawAction, joinedCount, pieceGroup, progressLabel } from './jigsaw-progress.js?v=tray-return';
import { createSnapSound } from './sound.js?v=card-on-wood';
import { createPuzzle, piecePath, shuffled } from './puzzle.js?v=quiet-gallery';

const $ = (id) => document.getElementById(id);
const board = $('board');
const dragLayer = $('drag-layer');
const tray = $('piece-tray');
const rack = $('piece-rack');
const hitContext = document.createElement('canvas').getContext('2d');
const sound = createSnapSound();
const zoomLevels = [.35, ...Array.from({ length: 39 }, (_, index) => (index + 4) / 10)];
const fitIndex = zoomLevels.indexOf(1);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function pointIn(element, { clientX, clientY }) {
  const rect = element.getBoundingClientRect();
  return clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom;
}

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

function paintGridDots(context, { x, y, scale }, { cols, rows, cellWidth, cellHeight }) {
  if (Math.min(cellWidth, cellHeight) * scale < 15) return;
  context.beginPath();
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const dotX = x + col * cellWidth * scale;
      const dotY = y + row * cellHeight * scale;
      context.moveTo(dotX + .65, dotY);
      context.arc(dotX, dotY, .65, 0, 2 * Math.PI);
    }
  }
  context.fillStyle = '#52576050';
  context.fill();
}

function paintPiece(context, image, piece, path, x, y, scale, stroke, shadow = false, lineWidth = 1) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  if (shadow) {
    context.shadowColor = '#26292e56';
    context.shadowBlur = 5;
    context.shadowOffsetY = 2;
    context.fillStyle = '#f7f7f8';
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
    this.pieceInset = Math.min(this.puzzle.cellWidth, this.puzzle.cellHeight) * .29;
    this.selected = null;
    this.pointer = null;
    this.keyboardCell = null;
    this.guide = false;
    this.edges = false;
    this.zoomIndex = fitIndex;
    this.pan = { x: 0, y: 0 };
    this.trayButtons = new Map();
    this.trayIds = new Set();
    tray.replaceChildren();
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
      this.refreshTray();
      this.render();
    });
    listen($('shuffle'), 'click', () => {
      this.cancel();
      this.select(null);
      this.apply({ type: 'shuffle', order: shuffled(this.progress.order) });
      tray.scrollLeft = 0;
    });
    listen($('toggle-sound'), 'click', () => {
      sound.toggle();
      this.refreshSound();
    });
    listen($('zoom-out'), 'click', () => this.setZoom(this.zoomIndex - 1));
    listen($('zoom-in'), 'click', () => this.setZoom(this.zoomIndex + 1));
    listen($('zoom-reset'), 'click', () => this.setZoom(fitIndex, undefined, true));
    listen(board, 'wheel', (event) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      if (this.pointer || Math.abs(event.deltaY) < 1 || event.timeStamp < (this.nextWheelZoom ?? 0)) return;
      this.nextWheelZoom = event.timeStamp + 100;
      const rect = board.getBoundingClientRect();
      this.setZoom(this.zoomIndex + (event.deltaY < 0 ? 1 : -1), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    }, { passive: false });

    listen(board, 'pointerdown', (event) => this.press(event));
    listen(tray, 'pointerdown', (event) => {
      const button = event.target.closest('[data-piece]');
      if (button) this.press(event, button);
    });
    for (const surface of [board, tray]) {
      listen(surface, 'pointermove', (event) => this.move(event));
      listen(surface, 'pointerup', (event) => this.release(event));
      listen(surface, 'pointercancel', (event) => this.cancel(event));
      listen(surface, 'lostpointercapture', (event) => this.cancel(event));
    }
    listen(tray, 'click', (event) => {
      const button = event.target.closest('[data-piece]');
      if (!button || event.detail !== 0) return;
      this.select(Number(button.dataset.piece));
      board.focus({ preventScroll: true });
      this.render();
    });
    listen(tray, 'scroll', () => this.refreshTrayArrows(), { passive: true });
    listen(tray, 'wheel', (event) => {
      if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      if (event.deltaY < 0 ? tray.scrollLeft <= 0 : tray.scrollLeft + tray.clientWidth >= tray.scrollWidth - 1) return;
      event.preventDefault();
      tray.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
    }, { passive: false });
    listen($('tray-back'), 'click', () => this.scrollTray(-1));
    listen($('tray-next'), 'click', () => this.scrollTray(1));
    listen(window, 'blur', () => this.cancel());
    listen(board, 'keydown', (event) => this.onKey(event));
    listen(board, 'blur', () => {
      this.keyboardCell = null;
      this.render();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(board);
    this.resizeObserver.observe(tray);
    this.setProgress(game);
  }

  destroy() {
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.cancel();
    cancelAnimationFrame(this.animation);
    tray.replaceChildren();
    board.style.cursor = '';
  }

  get done() {
    return this.placed.size === this.puzzle.pieces.length;
  }

  refreshProgress() {
    const total = this.puzzle.pieces.length;
    const joined = joinedCount(this.progress);
    $('game-count').textContent = progressLabel(this.progress, total);
    $('game-progress').max = total;
    $('game-progress').value = this.placed.size + joined - this.progress.groups.length;
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
    $('zoom-reset').setAttribute('aria-label', 'fit and center the frame, currently ' + percent);
    $('zoom-reset').disabled = this.done || (this.zoomIndex === fitIndex && !this.pan.x && !this.pan.y);
  }

  groupBounds(members) {
    const pieces = members.map((id) => this.puzzle.pieces[id]);
    const xs = pieces.map(({ x }) => x);
    const ys = pieces.map(({ y }) => y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x + this.puzzle.cellWidth, height: Math.max(...ys) - y + this.puzzle.cellHeight };
  }

  trayButton(id, members) {
    const key = members.join(',');
    const existing = this.trayButtons.get(id);
    if (existing?.dataset.members === key) return existing;
    const button = existing ?? document.createElement('button');
    button.type = 'button';
    button.className = 'piece-button';
    button.dataset.piece = id;
    button.dataset.members = key;
    button.setAttribute('aria-label', members.length === 1 ? 'piece ' + (id + 1) : 'group of ' + members.length + ' pieces');
    button.setAttribute('aria-pressed', String(id === this.selected));
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const size = 60;
    const bounds = this.groupBounds(members);
    const scale = (size - 8) / (Math.max(bounds.width, bounds.height) + this.pieceInset * 2);
    const context = fitCanvas(canvas, size, size);
    for (const member of members) {
      const piece = this.puzzle.pieces[member];
      paintPiece(context, this.image, piece, this.paths[member], (size - bounds.width * scale) / 2 + (piece.x - bounds.x) * scale,
        (size - bounds.height * scale) / 2 + (piece.y - bounds.y) * scale, scale, '#26292ea0', members.length === 1, .75);
    }
    button.replaceChildren(canvas);
    this.trayButtons.set(id, button);
    return button;
  }

  refreshTray() {
    const items = new Map();
    for (const id of this.progress.order) {
      if (this.placed.has(id) || this.positions.has(id) || !this.visiblePiece(id)) continue;
      const members = pieceGroup(this.progress.groups, id);
      if (members[0] === id) items.set(id, members);
    }
    for (const id of this.trayIds) if (!items.has(id)) this.trayButtons.get(id).remove();
    let next = tray.firstElementChild;
    for (const [id, members] of items) {
      const button = this.trayButton(id, members);
      if (button === next) next = next.nextElementSibling;
      else tray.insertBefore(button, next);
    }
    this.trayIds = new Set(items.keys());
    rack.hidden = this.done;
    $('tray-empty').hidden = items.size > 0;
    $('tray-empty').textContent = this.edges ? 'no edge pieces in the tray' : 'all pieces are on the table';
    this.refreshTrayArrows();
  }

  refreshTrayArrows() {
    $('tray-back').disabled = tray.scrollLeft <= 1;
    $('tray-next').disabled = tray.scrollLeft + tray.clientWidth >= tray.scrollWidth - 1;
  }

  scrollTray(direction) {
    tray.scrollLeft += direction * Math.max(60, tray.clientWidth - 65);
  }

  resize() {
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (!width || !height) return;
    if (!this.layout || width !== this.layout.width || height !== this.layout.height) {
      const scale = fitPuzzle(this.puzzle, width, height);
      const ratio = this.fitScale ? scale / this.fitScale : 1;
      this.cancel();
      this.pan = { x: this.pan.x * ratio, y: this.pan.y * ratio };
      this.fitScale = scale;
      this.layout = { width, height };
      this.updateViewport();
    }
    this.refreshTrayArrows();
  }

  setZoom(index, anchor, reset = false) {
    if (!this.layout || this.pointer || this.done) return;
    const nextIndex = clamp(index, 0, zoomLevels.length - 1);
    if (nextIndex === this.zoomIndex && !reset) return;
    const ratio = zoomLevels[nextIndex] / zoomLevels[this.zoomIndex];
    const { width, height } = this.layout;
    const x = (anchor?.x ?? width / 2) - width / 2;
    const y = (anchor?.y ?? height / 2) - height / 2;
    this.pan = reset ? { x: 0, y: 0 } : {
      x: x - (x - this.pan.x) * ratio,
      y: y - (y - this.pan.y) * ratio,
    };
    this.zoomIndex = nextIndex;
    this.updateViewport();
  }

  updateViewport() {
    const { width, height } = this.layout;
    const scale = this.fitScale * zoomLevels[this.zoomIndex];
    this.layout.scale = scale;
    this.pan = constrainPan(this.puzzle, this.layout, this.positions, this.pan);
    this.layout.x = (width - this.puzzle.width * scale) / 2 + this.pan.x;
    this.layout.y = (height - this.puzzle.height * scale) / 2 + this.pan.y;
    this.refreshZoom();
    this.render();
  }

  render() {
    if (!this.layout?.scale || !board.clientWidth) return;
    const { x, y, width, height, scale } = this.layout;
    const { width: imageWidth, height: imageHeight, cellWidth, cellHeight } = this.puzzle;
    const context = fitCanvas(board, width, height);
    if (this.done) {
      const fit = fitPuzzle(this.puzzle, width, height);
      const w = imageWidth * fit;
      const h = imageHeight * fit;
      context.drawImage(this.image, (width - w) / 2, (height - h) / 2, w, h);
      return;
    }

    const w = imageWidth * scale;
    const h = imageHeight * scale;
    context.fillStyle = '#f4f5f6';
    context.fillRect(x, y, w, h);
    if (this.guide) {
      context.globalAlpha = .38;
      context.drawImage(this.image, x, y, w, h);
      context.globalAlpha = 1;
    }
    context.strokeStyle = '#52576064';
    context.lineWidth = .8;
    context.strokeRect(x, y, w, h);
    paintGridDots(context, this.layout, this.puzzle);
    for (const id of this.placed) {
      const piece = this.puzzle.pieces[id];
      paintPiece(context, this.image, piece, this.paths[id], x + piece.x * scale, y + piece.y * scale, scale, '#26292e70', false, .65);
    }
    const pad = this.pieceInset * scale + 8;
    const active = this.pointer?.dragging ? this.pointer.members : null;
    const selection = this.selected === null ? [] : pieceGroup(this.progress.groups, this.selected);
    for (const [id, position] of this.positions) {
      if (!this.visiblePiece(id) || active?.includes(id)) continue;
      const left = x + position.x * scale;
      const top = y + position.y * scale;
      if (left - pad > width || left + cellWidth * scale + pad < 0 || top - pad > height || top + cellHeight * scale + pad < 0) continue;
      const selected = selection.includes(id);
      paintPiece(context, this.image, this.puzzle.pieces[id], this.paths[id], left, top, scale, selected ? '#49576a' : '#26292e92',
        !this.joinedIds.has(id), selected ? 1.6 : .75);
    }
    if (this.keyboardCell !== null) {
      const cell = this.puzzle.pieces[this.keyboardCell];
      context.lineWidth = 2;
      context.strokeStyle = '#49576a';
      context.strokeRect(x + cell.x * scale + 1, y + cell.y * scale + 1, cellWidth * scale - 2, cellHeight * scale - 2);
    }
  }

  visiblePiece(id) {
    return !this.edges || this.puzzle.pieces[id].border || this.joinedIds.has(id);
  }

  select(id) {
    this.trayButtons.get(this.selected)?.setAttribute('aria-pressed', 'false');
    this.selected = id;
    this.trayButtons.get(id)?.setAttribute('aria-pressed', 'true');
    const size = id === null ? 0 : pieceGroup(this.progress.groups, id).length;
    $('game-feedback').textContent = size === 0 ? ''
      : size === 1 ? 'selected piece ' + (id + 1) + '.' : 'selected group of ' + size + ' pieces.';
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
    const pad = this.pieceInset;
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
    const { x, y } = this.puzzle.pieces[cell];
    const id = this.selected;
    if (this.apply({ type: 'place', id, x, y, members: pieceGroup(this.progress.groups, id) })) return;
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
      case '0': this.setZoom(fitIndex, undefined, true); break;
      case 'Delete':
      case 'Backspace':
        if (this.positions.has(this.selected)) this.returnToTray(this.selected, pieceGroup(this.progress.groups, this.selected));
        else return;
        break;
      case 'Escape': this.select(null); break;
      default: return;
    }
    event.preventDefault();
    this.keyboardCell = row * cols + col;
    if (event.key.startsWith('Arrow')) this.revealCell(this.keyboardCell);
    this.render();
  }

  cycleSelection(direction) {
    const ids = this.progress.order.filter((id) => this.trayIds.has(id) || (this.positions.has(id) && this.visiblePiece(id)));
    if (!ids.length) return;
    const index = ids.indexOf(this.selected);
    const next = index === -1 ? (direction > 0 ? 0 : ids.length - 1) : (index + direction + ids.length) % ids.length;
    this.select(ids[next]);
    this.trayButtons.get(this.selected)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  press(event, button) {
    if (this.pointer || !this.layout || this.done || event.button !== 0) return;
    const point = this.worldAt(event.clientX, event.clientY);
    const id = button ? Number(button.dataset.piece) : this.findPiece(point);
    const position = this.positions.get(id);
    const surface = button ?? board;
    const members = id === undefined ? null : pieceGroup(this.progress.groups, id);
    let offset = position ? { x: point.x - position.x, y: point.y - position.y } : null;
    if (button) {
      const bounds = this.groupBounds(members);
      const anchor = this.puzzle.pieces[id];
      offset = { x: bounds.x + bounds.width / 2 - anchor.x, y: bounds.y + bounds.height / 2 - anchor.y };
    }
    this.pointer = {
      pointerId: event.pointerId,
      id,
      members,
      surface,
      fromTray: Boolean(button),
      x: event.clientX,
      y: event.clientY,
      pan: { ...this.pan },
      offset,
      dragging: false,
    };
    this.keyboardCell = null;
    if (!button) board.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
  }

  move(event) {
    if (!this.layout || this.done) return;
    const pointer = this.pointer;
    if (!pointer) {
      if (event.target === board && event.pointerType === 'mouse') {
        const point = this.worldAt(event.clientX, event.clientY);
        board.style.cursor = this.selected !== null && this.insidePicture(point) ? 'crosshair' : 'grab';
      }
      return;
    }
    if (event.pointerId !== pointer.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging) {
      if (Math.hypot(dx, dy) < 5) return;
      if (pointer.fromTray && event.pointerType === 'touch' && Math.abs(dx) > Math.abs(dy)) return;
      pointer.dragging = true;
      if (pointer.offset) {
        board.focus({ preventScroll: true });
        this.select(null);
        this.render();
      }
      board.style.cursor = 'grabbing';
    }
    if (!pointer.offset) {
      this.pan = { x: pointer.pan.x + dx, y: pointer.pan.y + dy };
      if (!this.animation) {
        this.animation = requestAnimationFrame(() => {
          this.animation = undefined;
          this.updateViewport();
        });
      }
      return;
    }
    rack.classList.toggle('is-drop-target', !pointer.fromTray && pointIn(rack, event));
    this.drawDrag(event, pointer);
  }

  drawDrag(event, pointer) {
    const { scale } = this.layout;
    const { cellWidth, cellHeight } = this.puzzle;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const padding = this.pieceInset * scale + 8;
    const anchor = this.puzzle.pieces[pointer.id];
    const originX = event.clientX - (pointer.offset.x + anchor.x) * scale;
    const originY = event.clientY - (pointer.offset.y + anchor.y) * scale;
    const context = fitCanvas(dragLayer, width, height);
    for (const id of pointer.members) {
      const piece = this.puzzle.pieces[id];
      const x = originX + piece.x * scale;
      const y = originY + piece.y * scale;
      if (x - padding > width || x + cellWidth * scale + padding < 0
          || y - padding > height || y + cellHeight * scale + padding < 0) continue;
      paintPiece(context, this.image, piece, this.paths[id], x, y, scale, '#26292eb4', pointer.members.length === 1);
    }
    dragLayer.hidden = false;
  }

  release(event) {
    const pointer = this.pointer;
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    this.pointer = null;
    dragLayer.hidden = true;
    rack.classList.remove('is-drop-target');
    board.style.cursor = 'grab';
    const point = this.worldAt(event.clientX, event.clientY);
    if (!pointer.dragging) {
      if (pointer.fromTray && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 5) return;
      if (!pointer.fromTray && this.selected !== null && this.insidePicture(point) && pointer.id !== this.selected) {
        this.tryCell(this.cellAt(point));
      } else {
        this.select(pointer.id === this.selected ? null : (pointer.id ?? null));
        this.render();
      }
      return;
    }
    if (!pointer.offset) return;
    if (!pointer.fromTray && pointIn(rack, event) && this.returnToTray(pointer.id, pointer.members)) return;
    if (pointIn(board, event)) {
      if (this.apply({
        type: 'drop', id: pointer.id, members: pointer.members,
        x: point.x - pointer.offset.x, y: point.y - pointer.offset.y,
      })) return;
    }
    this.render();
  }

  returnToTray(id, members) {
    if (!this.apply({ type: 'return', id, members })) return false;
    this.select(null);
    this.trayButtons.get(members[0])?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('game-feedback').textContent = members.length === 1 ? 'piece returned to the tray.' : 'group returned to the tray.';
    return true;
  }

  cancel(event) {
    if (event && event.pointerId !== this.pointer?.pointerId) return;
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer?.surface.hasPointerCapture(pointer.pointerId)) pointer.surface.releasePointerCapture(pointer.pointerId);
    dragLayer.hidden = true;
    rack.classList.remove('is-drop-target');
    board.style.cursor = 'grab';
    this.render();
  }

  setProgress({ placed, loose, order, groups = [] }) {
    this.progress = { placed, loose, order, groups };
    this.placed = new Set(placed);
    this.positions = new Map(loose);
    this.joinedIds = new Set(groups.flat());
    if (this.placed.has(this.selected)) this.select(null);
    const pointer = this.pointer;
    if (pointer?.members) {
      const members = pieceGroup(groups, pointer.id);
      if (this.placed.has(pointer.id) || pointer.fromTray === this.positions.has(pointer.id)
          || members.length !== pointer.members.length || members.some((id, index) => id !== pointer.members[index])) this.cancel();
    }
    if (this.done && this.pointer) this.cancel();
    this.refreshProgress();
    this.refreshTray();
    if (this.layout) this.updateViewport();
    else this.refreshZoom();
  }

  apply(action) {
    const next = applyJigsawAction(this.puzzle, this.progress, action);
    if (!next || next === this.progress) return false;
    if (next.placed.length > this.placed.size
        || (action.type === 'drop' && pieceGroup(next.groups, action.id).length > action.members.length)) sound.play();
    this.setProgress(next);
    this.onChange(this.progress, this.done, action);
    return true;
  }
}
