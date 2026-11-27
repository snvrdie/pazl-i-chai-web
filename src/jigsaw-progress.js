import { targetFor } from './puzzle.js?v=quiet-gallery';

export function pieceGroup(groups, id) {
  return groups.find((group) => group.includes(id)) ?? [id];
}

export function joinedCount({ groups = [] }) {
  return groups.reduce((count, group) => count + group.length, 0);
}

export function progressLabel(state, total) {
  const connected = joinedCount(state);
  return state.placed.length + ' of ' + total + (connected ? ' in frame · ' + connected + ' pieces connected' : '');
}

function neighbors(puzzle, id) {
  const { cols, rows } = puzzle;
  const { row, col } = puzzle.pieces[id];
  const ids = [];
  if (row > 0) ids.push(id - cols);
  if (row < rows - 1) ids.push(id + cols);
  if (col > 0) ids.push(id - 1);
  if (col < cols - 1) ids.push(id + 1);
  return ids;
}

function drop(puzzle, state, members, id, x, y) {
  const anchor = puzzle.pieces[id];
  const proposed = { x: x - anchor.x, y: y - anchor.y };
  const positions = new Map(state.loose);
  const joined = new Set(members);
  let origin = proposed;
  let distance = Infinity;

  function consider(candidate) {
    if (!targetFor(puzzle, candidate, proposed.x, proposed.y)) return;
    const error = Math.hypot((candidate.x - proposed.x) / puzzle.cellWidth, (candidate.y - proposed.y) / puzzle.cellHeight);
    if (error >= distance) return;
    origin = candidate;
    distance = error;
  }

  consider({ x: 0, y: 0 });
  for (const member of members) {
    for (const neighbor of neighbors(puzzle, member)) {
      const position = positions.get(neighbor);
      if (!position || joined.has(neighbor)) continue;
      const piece = puzzle.pieces[neighbor];
      consider({ x: position.x - piece.x, y: position.y - piece.y });
    }
  }

  const groups = state.groups ?? [];
  // Set iteration also visits members added by a newly connected group.
  for (const member of joined) {
    for (const neighbor of neighbors(puzzle, member)) {
      const position = positions.get(neighbor);
      if (!position || joined.has(neighbor)) continue;
      const piece = puzzle.pieces[neighbor];
      if (Math.abs(position.x - piece.x - origin.x) < puzzle.cellWidth * 1e-7
          && Math.abs(position.y - piece.y - origin.y) < puzzle.cellHeight * 1e-7) {
        for (const connected of pieceGroup(groups, neighbor)) joined.add(connected);
      }
    }
  }

  return moveGroup(puzzle, state, joined, origin);
}

function moveGroup(puzzle, state, members, origin) {
  const groups = (state.groups ?? []).filter(([first]) => !members.has(first));
  const loose = state.loose.filter(([id]) => !members.has(id));
  const ids = [...members].sort((a, b) => a - b);
  if ((origin.x === 0 && origin.y === 0) || ids.length === puzzle.pieces.length) {
    return { ...state, placed: [...state.placed, ...ids], loose, groups };
  }
  for (const id of ids) {
    const piece = puzzle.pieces[id];
    loose.push([id, { x: piece.x + origin.x, y: piece.y + origin.y }]);
  }
  if (ids.length > 1) groups.push(ids);
  return { ...state, loose, groups };
}

export function applyJigsawAction(puzzle, state, action) {
  const count = puzzle.pieces.length;
  const groups = state.groups ?? [];
  const validId = (id) => Number.isInteger(id) && id >= 0 && id < count;
  if (action.type === 'shuffle') {
    const { order } = action;
    if (!Array.isArray(order) || order.length !== count || new Set(order).size !== count || !order.every(validId)) return;
    if (state.placed.length === count) return state;
    const joined = new Set(groups.flat());
    return { ...state, loose: state.loose.filter(([id]) => joined.has(id)), order };
  }

  const { id, x, y, type } = action;
  if (!validId(id)) return;
  if (state.placed.includes(id)) return state;
  const members = pieceGroup(groups, id);
  const expected = action.members ?? [id];
  if (!Array.isArray(expected) || expected.length !== members.length || members.some((member, i) => expected[i] !== member)) {
    return state;
  }
  if (type === 'return') {
    const loose = state.loose.filter(([piece]) => !members.includes(piece));
    return loose.length === state.loose.length ? state : { ...state, loose };
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (type === 'place') {
    if (!targetFor(puzzle, puzzle.pieces[id], x, y)) return;
    return moveGroup(puzzle, state, new Set(members), { x: 0, y: 0 });
  }
  if (type === 'move') {
    if (Math.abs(x) > 16 * puzzle.width || Math.abs(y) > 16 * puzzle.height) return;
    if (members.length > 1) return state;
    return { ...state, loose: [...state.loose.filter(([piece]) => piece !== id), [id, { x, y }]] };
  }
  const limit = 16 * Math.max(puzzle.width, puzzle.height);
  if (type === 'drop' && Math.abs(x) <= limit && Math.abs(y) <= limit) {
    return drop(puzzle, state, members, id, x, y);
  }
}
