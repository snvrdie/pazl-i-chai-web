import assert from 'node:assert/strict';
import test from 'node:test';
import { areAdjacent, createWordSearch, matchWord } from '../src/wordsearch.js';
import { wordSearchPuzzles } from '../src/wordsearch-puzzles.js';

function countPaths(puzzle, text) {
  const { size, letters } = puzzle;
  const seen = new Set();
  let count = 0;

  function search(index, offset) {
    if (offset === text.length - 1) {
      count += 1;
      return;
    }
    seen.add(index);
    for (const next of [index - size, index + size, index - 1, index + 1]) {
      if (!seen.has(next) && letters[next] === text[offset + 1] && areAdjacent(size, index, next)) {
        search(next, offset + 1);
      }
    }
    seen.delete(index);
  }

  for (const [index, letter] of letters.entries()) {
    if (letter === text[0]) search(index, 0);
  }
  return count;
}

test('every published word search covers its grid and each word has a unique path', () => {
  const ids = new Set();
  for (const data of wordSearchPuzzles) {
    const puzzle = createWordSearch(data);
    assert.ok(!ids.has(puzzle.id), puzzle.id);
    ids.add(puzzle.id);
    assert.equal(puzzle.letters.length, puzzle.size ** 2);
    assert.equal(new Set(puzzle.words.flatMap((word) => word.path)).size, puzzle.letters.length);
    assert.ok(puzzle.words.some(({ path }) => path.slice(2).some((cell, i) => cell - path[i + 1] !== path[i + 1] - path[i])));
    for (const word of puzzle.words) {
      assert.equal(word.path.map((index) => puzzle.letters[index]).join(''), word.text);
      assert.equal(countPaths(puzzle, word.text), 1, puzzle.id + ': ' + word.text);
      assert.equal(matchWord(puzzle, word.path), word);
      assert.equal(matchWord(puzzle, [...word.path].reverse()), word);
      assert.equal(matchWord(puzzle, word.path.slice(0, -1)), undefined);
    }
  }
});

test('adjacency respects rows and excludes diagonals and cells outside the grid', () => {
  assert.ok(areAdjacent(3, 1, 2));
  assert.ok(areAdjacent(3, 1, 4));
  assert.ok(!areAdjacent(3, 2, 3));
  assert.ok(!areAdjacent(3, 0, 4));
  assert.ok(!areAdjacent(3, 8, 9));
});

test('word search rejects invalid paths and unused cells', () => {
  const base = { id: 'en-test', language: 'en', size: 2 };
  assert.throws(() => createWordSearch({ ...base, words: [{ text: 'ABCD', path: [0, 1, 2, 3] }] }), /Invalid path/);
  assert.throws(() => createWordSearch({ ...base, words: [{ text: 'ABCD', path: [0, 1, 3, 1] }] }), /Invalid path/);
  assert.throws(() => createWordSearch({ ...base, words: [{ text: 'ABC', path: [0, 1, 3] }] }), /Unused cells/);
});
