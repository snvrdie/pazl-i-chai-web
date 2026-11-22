import assert from 'node:assert/strict';
import test from 'node:test';
import { createPuzzle, levels, targetFor, shuffled } from '../src/puzzle.js';

test('all difficulty levels use the advertised counts across photo orientations', () => {
  for (const [width, height] of [[1800, 1200], [1200, 1800], [1000, 1000], [3000, 300]]) {
    for (const [level, data] of Object.entries(levels)) {
      const puzzle = createPuzzle(width, height, level, 42);
      assert.equal(puzzle.pieces.length, data.count);
      assert.equal(puzzle.cols * puzzle.rows, data.count);
      assert.ok(Math.abs(puzzle.cellWidth * puzzle.cols - width) < 1e-9);
      assert.ok(Math.abs(puzzle.cellHeight * puzzle.rows - height) < 1e-9);
    }
  }
});

test('cutouts are reproducible and all shared edges are complementary', () => {
  const puzzle = createPuzzle(1600, 1200, 'medium', 42);
  assert.deepEqual(puzzle, createPuzzle(1600, 1200, 'medium', 42));
  for (const piece of puzzle.pieces) {
    const { row, col, edges } = piece;
    if (row === 0) assert.equal(edges[0], 0);
    if (col === 0) assert.equal(edges[3], 0);
    if (row === puzzle.rows - 1) assert.equal(edges[2], 0);
    if (col === puzzle.cols - 1) assert.equal(edges[1], 0);
    if (col + 1 < puzzle.cols) assert.equal(edges[1], -puzzle.pieces[piece.id + 1].edges[3]);
    if (row + 1 < puzzle.rows) assert.equal(edges[2], -puzzle.pieces[piece.id + puzzle.cols].edges[0]);
  }
});

test('pieces snap within tolerance and reject other cells', () => {
  const puzzle = createPuzzle(1200, 900, 'easy', 42);
  const [first, next] = puzzle.pieces;
  assert.equal(targetFor(puzzle, first, first.x + 20, first.y - 20), true);
  assert.equal(targetFor(puzzle, first, next.x, next.y), false);
  assert.equal(targetFor(puzzle, first, first.x + puzzle.cellWidth * 0.4, first.y), false);
});

test('shuffle preserves each piece exactly once', () => {
  const input = Array.from({ length: 192 }, (_, index) => index);
  const order = shuffled(input);
  assert.equal(new Set(order).size, input.length);
  assert.deepEqual(order.toSorted((a, b) => a - b), input);
  assert.equal(input[0], 0);
});
