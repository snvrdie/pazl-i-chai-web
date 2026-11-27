import assert from 'node:assert/strict';
import test from 'node:test';
import { createPuzzle } from '../src/puzzle.js';
import { applyRoomAction, createRoomGame, jigsawSample, restoreRoomState } from '../src/room-game.js';
import { createScanword } from '../src/scanwords.js';
import { scanwordPuzzles } from '../src/scanwords-puzzles.js';
import { wordSearchPuzzles } from '../src/wordsearch-puzzles.js';

test('two players can find different words and a repeated word keeps the same state', () => {
  const puzzle = wordSearchPuzzles.find(({ id }) => id === 'ru-1');
  const { game, state } = createRoomGame({ type: 'wordsearch', id: puzzle.id });
  const [first, second] = puzzle.words;
  const afterFirst = applyRoomAction(game, state, { type: 'word', path: first.path });
  const afterSecond = applyRoomAction(game, afterFirst, { type: 'word', path: [...second.path].reverse() });
  assert.deepEqual(afterSecond.found, [first.text, second.text]);
  assert.equal(applyRoomAction(game, afterSecond, { type: 'word', path: first.path }), afterSecond);
  assert.deepEqual(state.found, []);
});

test('sudoku notes from different players merge and a digit clears that cell’s notes', () => {
  const { game, state } = createRoomGame({ type: 'sudoku', id: 'beginner-1' });
  const index = state.values.indexOf(0);
  const otherIndex = state.values.lastIndexOf(0);
  const firstNote = applyRoomAction(game, state, { type: 'note', index, digit: 2 });
  const bothNotes = applyRoomAction(game, firstNote, { type: 'note', index, digit: 4 });
  assert.equal(bothNotes.notes[index], (1 << 1) | (1 << 3));
  const otherMove = applyRoomAction(game, bothNotes, { type: 'cell', index: otherIndex, value: 8 });
  const bothMoves = applyRoomAction(game, otherMove, { type: 'cell', index, value: 3 });
  assert.equal(bothMoves.notes[index], 0);
  assert.equal(bothMoves.values[index], 3);
  assert.equal(bothMoves.values[otherIndex], 8);
});

test('scanword code uses the letters entered by both players', () => {
  const puzzle = createScanword(scanwordPuzzles.find(({ code }) => code));
  const { game, state } = createRoomGame({ type: 'scanwords', id: puzzle.id });
  assert.equal(applyRoomAction(game, state, { type: 'code' }), state);
  const filled = puzzle.code.positions.reduce((current, index, offset) =>
    applyRoomAction(game, current, { type: 'cell', index, value: puzzle.code.word[offset] }), state);
  assert.equal(applyRoomAction(game, filled, { type: 'code' }).codeSolved, true);
});

test('a saved scanword room restores revised answers before accepting another move', () => {
  const puzzle = createScanword(scanwordPuzzles.find(({ id }) => id === '9'));
  const { game, state: { values } } = createRoomGame({ type: 'scanwords', id: puzzle.id });
  const [index, oldLetter] = puzzle.previousLetters.entries().next().value;
  const legacy = { values: values.with(index, oldLetter), complete: false, codeSolved: true };
  const restored = restoreRoomState(game, legacy);
  assert.equal(restored.values[index], puzzle.cells[index].letter);
  assert.equal(restored.codeSolved, true);
  const edited = applyRoomAction(game, restored, { type: 'cell', index, value: oldLetter });
  assert.equal(restoreRoomState(game, edited), edited);
  assert.equal(edited.values[index], oldLetter);
});

test('placing a jigsaw piece wins over a late drag of the same piece', () => {
  const { game, state } = createRoomGame({ type: 'jigsaw', id: 'quiet-afternoon.jpg', level: 'easy' }, 7);
  const { width, height } = jigsawSample(game);
  const [piece] = createPuzzle(width, height, game.level, game.seed).pieces;
  const move = { type: 'move', id: piece.id, x: piece.x + 50, y: piece.y };
  const moved = applyRoomAction(game, state, move);
  assert.deepEqual(moved.loose, [[piece.id, { x: move.x, y: move.y }]]);
  const placed = applyRoomAction(game, moved, { type: 'place', id: piece.id, x: piece.x, y: piece.y });
  assert.deepEqual(placed.placed, [piece.id]);
  assert.deepEqual(placed.loose, []);
  assert.equal(applyRoomAction(game, placed, move), placed);
});

test('jigsaw pieces only join their actual neighbors and groups move together off the frame', () => {
  const { game, state } = createRoomGame({ type: 'jigsaw', id: 'quiet-afternoon.jpg', level: 'easy' }, 7);
  const { width, height } = jigsawSample(game);
  const puzzle = createPuzzle(width, height, game.level, game.seed);
  const x = -width;
  const y = height;
  const first = applyRoomAction(game, state, { type: 'drop', id: 0, x, y });
  const wrong = applyRoomAction(game, first, { type: 'drop', id: puzzle.cols, x: x + puzzle.cellWidth, y });
  assert.deepEqual(wrong.groups, []);
  const join = { type: 'drop', id: 1, x: x + puzzle.cellWidth + puzzle.cellWidth * .08, y: y - 5 };
  const joined = applyRoomAction(game, first, join);
  assert.deepEqual(joined.groups, [[0, 1]]);
  assert.deepEqual(joined.placed, []);
  assert.deepEqual(joined.loose, [[0, { x, y }], [1, { x: x + puzzle.cellWidth, y }]]);
  assert.equal(applyRoomAction(game, joined, join), joined);

  const moved = applyRoomAction(game, JSON.parse(JSON.stringify(joined)), {
    type: 'drop', id: 1, x: width * 2 + puzzle.cellWidth, y: -height, members: [0, 1],
  });
  assert.deepEqual(moved.loose, [[0, { x: width * 2, y: -height }], [1, { x: width * 2 + puzzle.cellWidth, y: -height }]]);
  const shuffled = applyRoomAction(game, moved, { type: 'shuffle', order: [...state.order].reverse() });
  assert.deepEqual(shuffled.loose, moved.loose);
  const placed = applyRoomAction(game, shuffled, {
    type: 'drop', id: 1, x: puzzle.cellWidth, y: 0, members: [0, 1],
  });
  assert.deepEqual(placed.placed, [0, 1]);
  assert.deepEqual(placed.groups, []);
  assert.deepEqual(placed.loose, []);
});

test('two off-frame jigsaw groups join through a member other than the one being dragged', () => {
  const { game, state } = createRoomGame({ type: 'jigsaw', id: 'road-to-the-sea.webp', level: 'easy' }, 7);
  const { width, height } = jigsawSample(game);
  const puzzle = createPuzzle(width, height, game.level, game.seed);
  const secondRow = puzzle.cols;
  const top = -height;
  const left = -width;
  const actions = [
    { id: 0, x: left, y: top },
    { id: 1, x: left + puzzle.cellWidth, y: top },
    { id: secondRow + 1, x: width, y: height },
    { id: secondRow + 2, x: width + puzzle.cellWidth, y: height },
    { id: secondRow + 2, x: left + 2 * puzzle.cellWidth, y: top + puzzle.cellHeight, members: [secondRow + 1, secondRow + 2] },
  ];
  const merged = actions.reduce((current, action) => applyRoomAction(game, current, { type: 'drop', ...action }), state);
  assert.deepEqual(merged.groups, [[0, 1, secondRow + 1, secondRow + 2]]);
  assert.equal(merged.loose.length, 4);

  const finished = puzzle.pieces.reduce((current, { id, x, y }) => {
    if (merged.groups[0].includes(id)) return current;
    return applyRoomAction(game, current, { type: 'drop', id, x: left + x, y: top + y });
  }, merged);
  assert.equal(finished.placed.length, puzzle.pieces.length);
  assert.deepEqual(finished.groups, []);
  assert.deepEqual(finished.loose, []);
});

test('single pieces and connected groups can be put away and taken back out', () => {
  const { game, state } = createRoomGame({ type: 'jigsaw', id: 'quiet-afternoon.jpg', level: 'easy' }, 7);
  const { width, height } = jigsawSample(game);
  const puzzle = createPuzzle(width, height, game.level, game.seed);
  const single = applyRoomAction(game, state, { type: 'drop', id: 0, x: -width, y: height });
  assert.deepEqual(applyRoomAction(game, single, { type: 'return', id: 0 }), state);

  const joined = applyRoomAction(game, single, { type: 'drop', id: 1, x: -width + puzzle.cellWidth, y: height });
  assert.equal(applyRoomAction(game, joined, { type: 'return', id: 0 }), joined);
  const returned = applyRoomAction(game, joined, { type: 'return', id: 1, members: [0, 1] });
  assert.deepEqual(returned.groups, [[0, 1]]);
  assert.deepEqual(returned.loose, []);
  const moved = applyRoomAction(game, JSON.parse(JSON.stringify(returned)), { type: 'drop', id: 0, x: width, y: height, members: [0, 1] });
  assert.deepEqual(moved.loose, [[0, { x: width, y: height }], [1, { x: width + puzzle.cellWidth, y: height }]]);
});
