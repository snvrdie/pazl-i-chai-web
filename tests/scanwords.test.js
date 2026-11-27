import assert from 'node:assert/strict';
import test from 'node:test';
import { createScanword, matchesScanwordCode, matchesScanwordLetter, restoreScanwordValues, russianLetter, scanwordDirections } from '../src/scanwords.js';
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

test('adjacent letters have an open border only when an answer joins them', () => {
  for (const data of scanwordPuzzles) {
    const puzzle = createScanword(data);
    const openBorders = { r: new Set(), d: new Set() };
    for (const word of puzzle.words) {
      const { axis } = scanwordDirections[word.direction];
      for (const position of word.positions.slice(1)) openBorders[axis].add(position);
    }
    for (const [index, cell] of puzzle.cells.entries()) {
      if (cell.kind !== 'letter') continue;
      if (index % puzzle.width && puzzle.cells[index - 1].kind === 'letter') {
        assert.equal(cell.barLeft, !openBorders.r.has(index), `${puzzle.id} left of ${index}`);
      }
      if (index >= puzzle.width && puzzle.cells[index - puzzle.width].kind === 'letter') {
        assert.equal(cell.barTop, !openBorders.d.has(index), `${puzzle.id} above ${index}`);
      }
    }
  }
});

test('expanded grids restore old entries to their original coordinates', () => {
  for (const data of scanwordPuzzles.filter(({ previousSize }) => previousSize)) {
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

test('revised scanwords carry forward solved letters and keep new entries as typed', () => {
  const revised = scanwordPuzzles.map((data) => ({ data, puzzle: createScanword(data) }))
    .filter(({ puzzle }) => puzzle.revision > 1);
  assert.ok(revised.length);
  for (const { data, puzzle } of revised) {
    const oldPuzzle = createScanword({
      ...data,
      entries: data.entries.map(([row, column, arrow, answer, question, previousAnswer]) =>
        [row, column, arrow, previousAnswer ?? answer, question]),
    });
    const oldValues = oldPuzzle.cells.map(({ letter }) => letter ?? '');
    assert.deepEqual(restoreScanwordValues(puzzle, oldValues), puzzle.cells.map(({ letter }) => letter ?? ''));
    assert.deepEqual(restoreScanwordValues(puzzle, oldValues, puzzle.revision), oldValues);
    const [changed] = puzzle.previousLetters.keys();
    oldValues[changed] = '';
    assert.equal(restoreScanwordValues(puzzle, oldValues)[changed], '');
  }
});

test('newest scanword grids offer a mix of short and long answers', () => {
  const newPuzzles = scanwordPuzzles.filter(({ previousSize }) => !previousSize);
  assert.ok(newPuzzles.length > 0);
  for (const { entries, id } of newPuzzles) {
    const lengths = entries.map(([, , , answer]) => answer.length);
    assert.ok(lengths.filter((length) => length >= 7).length >= 8, id);
    assert.ok(Math.max(...lengths) >= 9, id);
    assert.ok(lengths.some((length) => length <= 4), id);
  }
});

test('the default play order starts with full-page scanwords', () => {
  for (const { width, height, entries } of scanwordPuzzles.slice(0, 2)) {
    assert.ok(width >= 20 && height >= 20);
    assert.ok(entries.length >= 80);
  }
});

test('the linked series has priority in the play order, dense grids and code letters at crossings', () => {
  const linked = scanwordPuzzles.filter(({ code }) => code);
  assert.deepEqual(scanwordPuzzles.slice(0, 3), linked);
  for (const data of linked) {
    const puzzle = createScanword(data);
    const letters = puzzle.cells.filter(({ kind }) => kind === 'letter');
    assert.ok(puzzle.words.length >= 85, puzzle.id);
    assert.ok(letters.every(({ words }) => words.length > 0), puzzle.id);
    assert.ok(letters.filter(({ words }) => words.length === 2).length >= letters.length * 0.32, puzzle.id);
    assert.ok(puzzle.code.positions.every((position) => puzzle.cells[position].words.length === 2));

    const solved = puzzle.cells.map(({ letter }) => letter ?? '');
    assert.ok(matchesScanwordCode(solved, puzzle.code));
    solved[puzzle.code.positions[0]] = '';
    assert.ok(!matchesScanwordCode(solved, puzzle.code));
    const wrong = puzzle.code.word[0] === 'А' ? 'Я' : 'А';
    solved[puzzle.code.positions[0]] = wrong;
    assert.ok(!matchesScanwordCode(solved, puzzle.code));
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
