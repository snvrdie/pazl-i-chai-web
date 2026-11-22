import assert from 'node:assert/strict';
import test from 'node:test';
import { findSudokuConflicts, solveSudoku } from '../src/sudoku.js';
import { sudokuLevels } from '../src/sudoku-puzzles.js';

test('every published sudoku has one valid solution and a distinct completed board', () => {
  const seen = new Set();
  const solutions = new Set();
  for (const { name, grids } of sudokuLevels) {
    for (const [index, grid] of grids.entries()) {
      const id = name + '-' + (index + 1);
      assert.match(grid, /^[0-9]{81}$/, id);
      assert.ok(!seen.has(grid) && grid.includes('0'), id);
      seen.add(grid);
      const givens = Array.from(grid, Number);
      const { count, solution } = solveSudoku(givens, 2);
      assert.equal(count, 1, id);
      assert.ok(solution.every((value, cell) => !givens[cell] || value === givens[cell]), id);
      assert.ok(solution.every((value) => value >= 1 && value <= 9), id);
      assert.equal(findSudokuConflicts(solution).size, 0, id);
      assert.ok(!solutions.has(solution.join('')), id);
      solutions.add(solution.join(''));
    }
  }
});

test('duplicate numbers in a row, column or box are detected', () => {
  const grid = Array(81).fill(0);
  grid[0] = grid[7] = 1;
  grid[17] = grid[62] = 2;
  grid[30] = grid[41] = 3;
  grid[80] = 4;
  assert.deepEqual([...findSudokuConflicts(grid)].sort((a, b) => a - b), [0, 7, 17, 30, 41, 62]);
  assert.equal(solveSudoku(grid).count, 0);
});
