const right = { row: 0, column: 1, axis: 'r' };
const down = { row: 1, column: 0, axis: 'd' };

export const scanwordDirections = {
  r: { ...right, startRow: 0, startColumn: 1, arrow: '→', label: 'вправо' },
  d: { ...down, startRow: 1, startColumn: 0, arrow: '↓', label: 'вниз' },
  rd: { ...down, startRow: 0, startColumn: 1, arrow: '↴', label: 'шаг вправо, затем вниз' },
  dr: { ...right, startRow: 1, startColumn: 0, arrow: '↳', label: 'шаг вниз, затем вправо' },
  ur: { ...right, startRow: -1, startColumn: 0, arrow: '↑→', label: 'шаг вверх, затем вправо' },
  drd: { ...down, startRow: 1, startColumn: 1, arrow: '↘↓', label: 'по диагонали вправо-вниз, затем вниз' },
  dld: { ...down, startRow: 1, startColumn: -1, arrow: '↙↓', label: 'по диагонали влево-вниз, затем вниз' },
  rdr: { ...right, startRow: 1, startColumn: 1, arrow: '↘→', label: 'по диагонали вправо-вниз, затем вправо' },
};

export function russianLetter(value) {
  if (typeof value !== 'string') return '';
  const letter = value.normalize('NFC').toUpperCase();
  return /^[А-ЯЁ]$/.test(letter) ? letter : '';
}

export function matchesScanwordLetter(value, answer) {
  return value.replace('Ё', 'Е') === answer.replace('Ё', 'Е');
}

export function matchesScanwordCode(values, code) {
  return code.positions.every((position, index) => matchesScanwordLetter(values[position] ?? '', code.word[index]));
}

export function restoreScanwordValues(puzzle, stored, revision = 1) {
  const [previousWidth, previousHeight] = puzzle.previousSize;
  const values = Array.isArray(stored) ? stored : [];
  const isPreviousSize = values.length === previousWidth * previousHeight;

  return puzzle.cells.map((cell, index) => {
    if (cell.kind !== 'letter') return '';
    let savedIndex = index;
    if (isPreviousSize) {
      const row = Math.floor(index / puzzle.width);
      const column = index % puzzle.width;
      if (row >= previousHeight || column >= previousWidth) return '';
      savedIndex = row * previousWidth + column;
    }
    const value = russianLetter(values[savedIndex]);
    const oldLetter = puzzle.previousLetters.get(index);
    return revision < puzzle.revision && oldLetter && matchesScanwordLetter(value, oldLetter) ? cell.letter : value;
  });
}

export function createScanword({ id, width, height, previousSize = [width, height], entries, code }) {
  const cells = Array(width * height).fill(null);
  const previousLetters = new Map();

  function indexAt(row, column) {
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= height || column < 0 || column >= width) {
      throw new Error('Scanword ' + id + ' has a cell outside the board');
    }
    return row * width + column;
  }

  const words = entries.map(([row, column, direction, answer, question, previousAnswer = answer], index) => {
    const step = scanwordDirections[direction];
    if (!step || !/^[А-ЯЁ]+$/.test(answer) || !question.trim() || previousAnswer.length !== answer.length) {
      throw new Error('Scanword ' + id + ' has an invalid clue');
    }
    const clueIndex = indexAt(row, column);
    const clue = cells[clueIndex] ?? { kind: 'clue', words: [] };
    if (clue.kind !== 'clue' || clue.words.some((other) => scanwordDirections[entries[other][2]].axis === step.axis)) {
      throw new Error('Scanword ' + id + ' has overlapping clues');
    }
    clue.words.push(index);
    cells[clueIndex] = clue;

    const positions = Array.from(answer, (letter, offset) => {
      const position = indexAt(row + step.startRow + step.row * offset, column + step.startColumn + step.column * offset);
      const cell = cells[position] ?? { kind: 'letter', letter, words: [] };
      if (cell.kind !== 'letter' || cell.letter !== letter || cell.words.some((other) => scanwordDirections[entries[other][2]].axis === step.axis)) {
        throw new Error('Scanword ' + id + ' has an invalid crossing');
      }
      cell.words.push(index);
      cells[position] = cell;
      if (previousAnswer[offset] !== letter) previousLetters.set(position, previousAnswer[offset]);
      return position;
    });
    return { number: index + 1, clueIndex, direction, question, positions };
  });

  if (cells.includes(null)) throw new Error('Scanword ' + id + ' has unused cells');

  function requiresBar(cell, neighbour, axis) {
    return neighbour.kind === 'letter' && !cell.words.some((index) =>
      scanwordDirections[words[index].direction].axis === axis && neighbour.words.includes(index));
  }

  for (const [index, cell] of cells.entries()) {
    if (cell.kind !== 'letter') continue;
    cell.barLeft = index % width !== 0 && requiresBar(cell, cells[index - 1], 'r');
    cell.barTop = index >= width && requiresBar(cell, cells[index - width], 'd');
  }

  let codeword;
  if (code) {
    const positions = code.cells.map(([row, column]) => indexAt(row, column));
    const isValid = /^[А-ЯЁ]{5,9}$/.test(code.word)
      && positions.length === code.word.length
      && new Set(positions).size === positions.length
      && positions.every((position, index) => cells[position].kind === 'letter'
        && cells[position].words.length === 2
        && cells[position].letter === code.word[index]);
    if (!isValid) throw new Error('Scanword ' + id + ' has an invalid codeword');
    codeword = { word: code.word, positions };
  }

  const revision = previousLetters.size ? 2 : 1;
  return { id, width, height, previousSize, previousLetters, revision, cells, words, code: codeword };
}
