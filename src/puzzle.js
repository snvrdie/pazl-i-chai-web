export const levels = {
  easy: { label: 'beginner', count: 12 },
  relaxed: { label: 'easy', count: 24 },
  medium: { label: 'medium', count: 48 },
  hard: { label: 'hard', count: 108 },
  advanced: { label: 'advanced', count: 150 },
  expert: { label: 'expert', count: 192 },
};

function gridFor(count, aspect) {
  let best = Infinity;
  let grid;
  for (let cols = 2; cols <= count / 2; cols += 1) {
    if (count % cols !== 0) continue;
    const rows = count / cols;
    const difference = Math.abs(Math.log(cols / rows / aspect));
    if (difference < best) {
      grid = { cols, rows };
      best = difference;
    }
  }
  return grid;
}

export function seededRandom(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export function createPuzzle(width, height, level, seed) {
  const { count } = levels[level];
  const { cols, rows } = gridFor(count, width / height);
  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const random = seededRandom(seed);
  const pieces = [];
  const direction = () => random() < 0.5 ? -1 : 1;
  for (let id = 0; id < count; id += 1) {
    const row = Math.floor(id / cols);
    const col = id % cols;
    const top = row > 0 ? -pieces[id - cols].edges[2] : 0;
    const right = col < cols - 1 ? direction() : 0;
    const bottom = row < rows - 1 ? direction() : 0;
    const left = col > 0 ? -pieces[id - 1].edges[1] : 0;
    const edges = [top, right, bottom, left];
    pieces.push({ id, row, col, x: col * cellWidth, y: row * cellHeight, edges, border: edges.includes(0) });
  }
  return { width, height, cols, rows, cellWidth, cellHeight, pieces };
}

// Traverse each edge clockwise. The symmetric tab profile also fits its neighbour in reverse.
export function piecePath(puzzle, piece) {
  const w = puzzle.cellWidth;
  const h = puzzle.cellHeight;
  const depth = Math.min(w, h) * 0.245;
  const path = new Path2D();
  path.moveTo(0, 0);
  const sides = [[0, 0, w, 0], [w, 0, 0, h], [w, h, -w, 0], [0, h, 0, -h]];
  sides.forEach(([x, y, dx, dy], index) => {
    const sign = piece.edges[index];
    if (sign === 0) {
      path.lineTo(x + dx, y + dy);
      return;
    }
    const length = Math.hypot(dx, dy);
    const nx = dy / length * depth * sign;
    const ny = -dx / length * depth * sign;
    const point = (along, out) => [x + along * dx + out * nx, y + along * dy + out * ny];
    const curve = (a, b, c) => path.bezierCurveTo(...point(...a), ...point(...b), ...point(...c));
    path.lineTo(...point(0.31, 0));
    curve([0.37, 0], [0.42, 0], [0.41, 0.22]);
    curve([0.32, 0.92], [0.4, 1.12], [0.5, 1.12]);
    curve([0.6, 1.12], [0.68, 0.92], [0.59, 0.22]);
    curve([0.58, 0], [0.63, 0], [0.69, 0]);
    path.lineTo(x + dx, y + dy);
  });
  path.closePath();
  return path;
}

export function targetFor(puzzle, piece, x, y) {
  return Math.abs(piece.x - x) <= puzzle.cellWidth * 0.27
    && Math.abs(piece.y - y) <= puzzle.cellHeight * 0.27;
}

export function shuffled(values, random = Math.random) {
  const order = [...values];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
