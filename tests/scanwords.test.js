import assert from 'node:assert/strict';
import test from 'node:test';
import { createScanword, matchesScanwordLetter, restoreScanwordValues, russianLetter, scanwordDirections } from '../src/scanwords.js';
import { scanwordPuzzles } from '../src/scanwords-puzzles.js';

test('each scanword is full and contains a connected grid of intersecting answers', () => {
  const answers = new Set();
  for (const data of scanwordPuzzles) {
    const puzzle = createScanword(data);
    assert.equal(puzzle.cells.length, puzzle.width * puzzle.height);
    assert.ok(puzzle.cells.every((cell) => cell?.kind === 'letter' || cell?.kind === 'clue'));
    assert.ok(puzzle.words.some((word) => word.direction.length === 2));
    const reached = new Set([0]);
    const pending = [0];
    while (pending.length) {
      const word = puzzle.words[pending.pop()];
      for (const position of word.positions) {
        for (const neighbour of puzzle.cells[position].words) {
          if (reached.has(neighbour)) continue;
          reached.add(neighbour);
          pending.push(neighbour);
        }
      }
    }
    assert.equal(reached.size, data.entries.length, data.id);
    for (const [index, [row, column, direction, answer]] of data.entries.entries()) {
      const word = puzzle.words[index];
      const step = scanwordDirections[direction];
      assert.ok(puzzle.cells[row * puzzle.width + column].words.includes(index));
      assert.equal(word.positions.map((position) => puzzle.cells[position].letter).join(''), answer);
      assert.equal(word.positions[0], (row + step.startRow) * puzzle.width + column + step.startColumn);
      word.positions.slice(1).forEach((position, offset) => {
        assert.equal(position, word.positions[offset] + step.row * puzzle.width + step.column);
      });
      assert.ok(!answers.has(answer), answer);
      answers.add(answer);
    }
  }
});

test('unclaimed cells are rejected', () => {
  assert.throws(() => createScanword({ id: 'invalid', width: 5, height: 1, entries: [[0, 0, 'r', 'КОТ', 'домашний питомец']] }), /unused cells/);
});

test('expanded grids restore old entries to their original coordinates', () => {
  for (const data of scanwordPuzzles) {
    const puzzle = createScanword(data);
    const [oldWidth, oldHeight] = puzzle.previousSize;
    const saved = Array.from({ length: oldWidth * oldHeight }, (_, index) => {
      const row = Math.floor(index / oldWidth);
      const column = index % oldWidth;
      return puzzle.cells[row * puzzle.width + column].letter ?? '';
    });
    const restored = restoreScanwordValues(puzzle, saved);
    for (const [index, cell] of puzzle.cells.entries()) {
      const existing = Math.floor(index / puzzle.width) < oldHeight && index % puzzle.width < oldWidth;
      assert.equal(restored[index], existing ? cell.letter ?? '' : '');
    }
    restored[puzzle.cells.findIndex((cell, index) => cell.kind === 'letter' && !restored[index])] = 'Я';
    assert.deepEqual(restoreScanwordValues(puzzle, restored), restored);
  }
});

test('russian entry accepts both cases and allows ё and е in answers', () => {
  assert.equal(russianLetter('ж'), 'Ж');
  assert.equal(russianLetter('е\u0308'), 'Ё');
  assert.equal(russianLetter('A'), '');
  assert.equal(russianLetter('да'), '');
  assert.ok(matchesScanwordLetter('Е', 'Ё'));
  assert.ok(!matchesScanwordLetter('А', 'Я'));
});
