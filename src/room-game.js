import { samples } from './images.js?v=dotted-board';
import { createPuzzle, levels, seededRandom, shuffled } from './puzzle.js?v=quiet-gallery';
import { applyJigsawAction } from './jigsaw-progress.js?v=tray-return';
import { createScanword, matchesScanwordCode, matchesScanwordLetter, restoreScanwordValues, russianLetter } from './scanwords.js?v=puzzle-layout';
import { scanwordPuzzles } from './scanwords-puzzles.js?v=balanced';
import { solveSudoku } from './sudoku.js';
import { sudokuLevels } from './sudoku-puzzles.js?v=expanded';
import { createWordSearch, matchWord } from './wordsearch.js?v=fillwords';
import { wordSearchPuzzles } from './wordsearch-puzzles.js?v=untitled';

const scanwords = new Map(scanwordPuzzles.map((puzzle) => [puzzle.id, createScanword(puzzle)]));
const wordSearches = new Map(wordSearchPuzzles.map((puzzle) => [puzzle.id, createWordSearch(puzzle)]));
const sudoku = new Map(sudokuLevels.flatMap(({ name, grids }) => grids.map((grid, index) => [
  name + '-' + (index + 1), { givens: Array.from(grid, Number) },
])));

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function jigsawSample(game) {
  return samples.find(({ filename }) => filename === game.id);
}

export function createRoomGame(config, seed) {
  const { type, id, level } = config ?? {};
  if (typeof id !== 'string') return;
  switch (type) {
    case 'wordsearch':
      if (wordSearches.has(id)) return { game: { type, id }, state: { found: [] } };
      break;
    case 'sudoku': {
      const puzzle = sudoku.get(id);
      if (puzzle) return { game: { type, id }, state: { values: puzzle.givens, notes: Array(81).fill(0), complete: false } };
      break;
    }
    case 'scanwords': {
      const puzzle = scanwords.get(id);
      if (puzzle) {
        return {
          game: { type, id },
          state: { values: Array(puzzle.cells.length).fill(''), complete: false, codeSolved: false, puzzleRevision: puzzle.revision },
        };
      }
      break;
    }
    case 'jigsaw': {
      const count = typeof level === 'string' && Object.hasOwn(levels, level) && levels[level].count;
      if (count && jigsawSample({ id })) {
        const order = shuffled(Array.from({ length: count }, (_, index) => index), seededRandom(seed));
        return { game: { type, id, level, seed }, state: { placed: [], loose: [], groups: [], order } };
      }
      break;
    }
  }
}

export function restoreRoomState(game, state) {
  if (game.type !== 'scanwords') return state;
  const puzzle = scanwords.get(game.id);
  if (!puzzle || (state.puzzleRevision ?? 1) >= puzzle.revision) return state;
  const values = restoreScanwordValues(puzzle, state.values, state.puzzleRevision);
  return { ...state, values, puzzleRevision: puzzle.revision };
}

function changeSudoku(puzzle, state, action) {
  const { index, value, digit, type } = action;
  if (!integer(index, 0, 80) || puzzle.givens[index]) return;
  if (type === 'note' && integer(digit, 1, 9)) {
    if (state.complete || state.values[index]) return state;
    const notes = [...state.notes];
    notes[index] ^= 1 << (digit - 1);
    return { ...state, notes };
  }
  if (type !== 'cell' || !integer(value, 0, 9)) return;
  if (state.complete || (state.values[index] === value && !state.notes[index])) return state;
  const values = [...state.values];
  const notes = [...state.notes];
  values[index] = value;
  notes[index] = 0;
  puzzle.solution ??= solveSudoku(puzzle.givens).solution;
  return { values, notes, complete: puzzle.solution.every((digit, cell) => digit === values[cell]) };
}

function changeScanword(puzzle, state, action) {
  if (action.type === 'code') {
    if (!puzzle.code) return;
    if (state.codeSolved || !matchesScanwordCode(state.values, puzzle.code)) return state;
    return { ...state, codeSolved: true };
  }
  const { index, value } = action;
  if (action.type !== 'cell' || !integer(index, 0, puzzle.cells.length - 1)
      || puzzle.cells[index].kind !== 'letter' || (value !== '' && (!value || russianLetter(value) !== value))) return;
  if (state.complete || state.values[index] === value) return state;
  const values = [...state.values];
  values[index] = value;
  const complete = puzzle.cells.every((cell, index) => cell.kind !== 'letter' || matchesScanwordLetter(values[index], cell.letter));
  return { ...state, values, complete };
}

function changeJigsaw(game, state, action) {
  const { width, height } = jigsawSample(game);
  return applyJigsawAction(createPuzzle(width, height, game.level, game.seed), state, action);
}

// The server and the optimistic client apply the same game rules to each action.
export function applyRoomAction(game, state, action) {
  if (!action || typeof action !== 'object') return;
  switch (game.type) {
    case 'wordsearch': {
      if (action.type !== 'word' || !Array.isArray(action.path)) return;
      const match = matchWord(wordSearches.get(game.id), action.path);
      if (!match) return;
      return state.found.includes(match.text) ? state : { found: [...state.found, match.text] };
    }
    case 'sudoku':
      return changeSudoku(sudoku.get(game.id), state, action);
    case 'scanwords':
      return changeScanword(scanwords.get(game.id), state, action);
    case 'jigsaw':
      return changeJigsaw(game, state, action);
  }
}
