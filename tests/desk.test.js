import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainPan, fitPuzzle } from '../src/desk.js';
import { createPuzzle, levels } from '../src/puzzle.js';

test('the frame uses the same space regardless of how many pieces are in the tray', () => {
  for (const [viewWidth, viewHeight] of [[1360, 650], [360, 480], [320, 400]]) {
    for (const [width, height] of [[1536, 1024], [900, 1200], [1600, 200], [200, 1600]]) {
      const fit = fitPuzzle(createPuzzle(width, height, 'easy', 47), viewWidth, viewHeight);
      assert.ok(width * fit < viewWidth && height * fit < viewHeight);
      assert.ok(Math.max(width * fit / viewWidth, height * fit / viewHeight) >= .83);
      for (const level of Object.keys(levels)) {
        assert.equal(fitPuzzle(createPuzzle(width, height, level, 47), viewWidth, viewHeight), fit);
      }
    }
  }
});

test('panning can reveal pieces saved well beyond the frame', () => {
  const puzzle = createPuzzle(1200, 900, 'medium', 47);
  const width = 360;
  const height = 480;
  const scale = fitPuzzle(puzzle, width, height);
  const view = { width, height, scale };
  const position = { x: -puzzle.width * 2, y: puzzle.height * 2 };
  const pan = constrainPan(puzzle, view, new Map([[0, position]]), { x: Infinity, y: -Infinity });
  const left = (width - puzzle.width * scale) / 2 + pan.x + position.x * scale;
  const top = (height - puzzle.height * scale) / 2 + pan.y + position.y * scale;
  assert.ok(left >= 0 && left + puzzle.cellWidth * scale <= width);
  assert.ok(top >= 0 && top + puzzle.cellHeight * scale <= height);
  assert.deepEqual(constrainPan(puzzle, view, new Map(), { x: 0, y: 0 }), { x: 0, y: 0 });
});
