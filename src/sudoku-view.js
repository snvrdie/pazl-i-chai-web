import { findSudokuConflicts, solveSudoku, sudokuRows } from './sudoku.js';
import { sudokuLevels } from './sudoku-puzzles.js?v=expanded';

const $ = (id) => document.getElementById(id);
const storageKey = 'puzzlemood-sudoku-v1';
const digits = Array.from({ length: 9 }, (_, index) => index + 1);
const levels = sudokuLevels.map(({ name, grids }) => ({
  name,
  puzzles: grids.map((grid, index) => ({
    id: name + '-' + (index + 1),
    difficulty: name,
    givens: Array.from(grid, Number),
  })),
}));
const puzzles = levels.flatMap(({ puzzles }) => puzzles);
const puzzleLink = ({ id }) => '#sudoku/' + id;

function readProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // A fresh board is still available if browser storage is blocked.
  }
  return {};
}

function numberInRange(value, maximum) {
  return Number.isInteger(value) && value >= 0 && value <= maximum ? value : 0;
}

export function createSudokuView() {
  const progress = readProgress();
  const board = $('sudoku-board');
  const cells = [];
  const numberKeys = [];
  const noteButton = $('sudoku-notes');
  const eraseButton = $('sudoku-erase');
  const checkButton = $('sudoku-check');
  let current;
  let solution;
  let values;
  let notes;
  let selected = 0;
  let takingNotes = false;
  let complete = false;
  let checked = new Set();

  function renderLobby() {
    Object.assign(progress, readProgress());
    const count = puzzles.filter((puzzle) => progress[puzzle.id]?.complete).length;
    const next = puzzles.find((puzzle) => !progress[puzzle.id]?.complete);
    const orderLink = $('sudoku-order-link');
    $('sudoku-progress').textContent = count + ' of ' + puzzles.length + ' complete';
    orderLink.hidden = !next;
    if (next) {
      orderLink.href = puzzleLink(next);
      orderLink.textContent = (count || progress[next.id] ? 'continue with puzzle ' : 'start with puzzle ') + (puzzles.indexOf(next) + 1);
    }

    const levelRows = levels.map(({ name, puzzles: group }) => {
      const row = document.createElement('div');
      row.className = 'sudoku-level';
      const heading = document.createElement('h3');
      heading.textContent = name;
      const options = document.createElement('div');
      options.className = 'sudoku-level-links';
      for (const puzzle of group) {
        const number = puzzles.indexOf(puzzle) + 1;
        const isComplete = progress[puzzle.id]?.complete;
        const link = document.createElement('a');
        link.href = puzzleLink(puzzle);
        link.textContent = number;
        link.setAttribute('aria-label', name + ', puzzle ' + number + (isComplete ? ', complete' : ''));
        link.classList.toggle('is-complete', Boolean(isComplete));
        options.append(link);
      }
      row.append(heading, options);
      return row;
    });
    $('sudoku-level-list').replaceChildren(...levelRows);
  }

  function renderBoard() {
    const conflicts = findSudokuConflicts(values);
    for (const [index, { cell, button }] of cells.entries()) {
      const fixed = Boolean(current.givens[index]);
      const isSelected = index === selected;
      const invalid = conflicts.has(index) || checked.has(index);
      const value = values[index];
      const markedDigits = value ? [] : digits.filter((digit) => notes[index] & (1 << (digit - 1)));
      cell.setAttribute('aria-selected', String(isSelected));
      cell.setAttribute('aria-readonly', String(fixed || complete));
      button.tabIndex = isSelected ? 0 : -1;
      button.classList.toggle('is-given', fixed);
      button.classList.toggle('is-conflict', invalid);
      const description = value ? String(value) : markedDigits.length ? 'notes ' + markedDigits.join(', ') : 'empty';
      const position = 'row ' + (Math.floor(index / 9) + 1) + ', column ' + (index % 9 + 1);
      button.setAttribute('aria-label', position + ', ' + description + (fixed ? ', given' : '') + (invalid ? ', needs review' : ''));
      if (markedDigits.length) {
        const annotation = document.createElement('span');
        annotation.className = 'sudoku-annotations';
        annotation.setAttribute('aria-hidden', 'true');
        for (const digit of digits) {
          const mark = document.createElement('span');
          if (markedDigits.includes(digit)) mark.textContent = digit;
          annotation.append(mark);
        }
        button.replaceChildren(annotation);
      } else {
        button.textContent = value || '';
      }
    }
    for (const button of [...numberKeys, noteButton, eraseButton, checkButton]) button.disabled = complete;

    const nextLink = $('sudoku-next');
    nextLink.hidden = !complete;
    if (complete) {
      const next = puzzles.slice(puzzles.indexOf(current) + 1).find((puzzle) => !progress[puzzle.id]?.complete);
      nextLink.href = next ? puzzleLink(next) : '#sudoku';
      nextLink.textContent = next ? 'next puzzle' : 'back to levels';
    }
  }

  function save() {
    const currentProgress = { values, notes, complete };
    progress[current.id] = currentProgress;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...progress, ...readProgress(), [current.id]: currentProgress }));
    } catch {
      // The current session remains playable without saved progress.
    }
  }

  function enter(digit) {
    if (!current || complete || current.givens[selected]) return;
    if (digit && takingNotes) {
      if (values[selected]) return;
      notes[selected] ^= 1 << (digit - 1);
    } else {
      values[selected] = digit;
      notes[selected] = 0;
    }
    checked.clear();
    complete = solution.every((value, index) => value === values[index]);
    save();
    renderBoard();
    $('sudoku-feedback').textContent = complete ? 'puzzle complete.' : '';
  }

  function select(index, focus = false) {
    selected = index;
    renderBoard();
    if (focus) cells[index].button.focus({ preventScroll: true });
  }

  function open(id = '') {
    const puzzle = puzzles.find((puzzle) => puzzle.id === id);
    $('sudoku-lobby').hidden = Boolean(puzzle);
    $('sudoku-game').hidden = !puzzle;
    if (!puzzle) {
      renderLobby();
      $('sudoku-title').focus({ preventScroll: true });
      return;
    }

    if (puzzle !== current) {
      current = puzzle;
      solution = solveSudoku(puzzle.givens).solution;
      const saved = progress[id];
      values = puzzle.givens.map((given, index) => given || numberInRange(saved?.values?.[index], 9));
      notes = values.map((value, index) => value ? 0 : numberInRange(saved?.notes?.[index], 511));
      complete = solution.every((value, index) => value === values[index]);
      selected = puzzle.givens.findIndex((value) => value === 0);
      takingNotes = false;
      noteButton.setAttribute('aria-pressed', 'false');
      checked = new Set();
    }
    const number = puzzles.indexOf(puzzle) + 1;
    $('sudoku-game-meta').textContent = puzzle.difficulty + ' · puzzle ' + number + ' of ' + puzzles.length;
    $('sudoku-feedback').textContent = complete ? 'puzzle complete.' : '';
    renderBoard();
    $('sudoku-game-title').focus({ preventScroll: true });
  }

  for (const indices of sudokuRows) {
    const row = document.createElement('div');
    row.className = 'sudoku-row';
    row.setAttribute('role', 'row');
    for (const index of indices) {
      const cell = document.createElement('div');
      cell.className = 'sudoku-cell';
      cell.setAttribute('role', 'gridcell');
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', () => select(index));
      cell.append(button);
      row.append(cell);
      cells.push({ cell, button });
    }
    board.append(row);
  }

  for (const digit of digits) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = digit;
    button.addEventListener('click', () => enter(digit));
    numberKeys.push(button);
  }
  $('sudoku-keypad').append(...numberKeys);

  noteButton.addEventListener('click', () => {
    takingNotes = !takingNotes;
    noteButton.setAttribute('aria-pressed', String(takingNotes));
  });
  eraseButton.addEventListener('click', () => enter(0));
  checkButton.addEventListener('click', () => {
    checked = new Set(values.flatMap((value, index) => value && value !== solution[index] ? [index] : []));
    $('sudoku-feedback').textContent = checked.size
      ? checked.size + (checked.size === 1 ? ' cell needs review.' : ' cells need review.')
      : 'no mistakes in the filled cells.';
    renderBoard();
  });
  board.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const { key } = event;
    const row = Math.floor(selected / 9);
    const column = selected % 9;
    if (key === 'ArrowLeft') select(row * 9 + Math.max(0, column - 1), true);
    else if (key === 'ArrowRight') select(row * 9 + Math.min(8, column + 1), true);
    else if (key === 'ArrowUp') select(Math.max(0, row - 1) * 9 + column, true);
    else if (key === 'ArrowDown') select(Math.min(8, row + 1) * 9 + column, true);
    else if (key >= '1' && key <= '9' && key.length === 1) enter(Number(key));
    else if (key === 'Delete' || key === 'Backspace' || key === '0') enter(0);
    else return;
    event.preventDefault();
  });

  return { open };
}
