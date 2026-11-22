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

export function restoreScanwordValues(puzzle, stored) {
  const [previousWidth, previousHeight] = puzzle.previousSize;
  const values = Array.isArray(stored) ? stored : [];
  const isPreviousSize = values.length === previousWidth * previousHeight;

  return puzzle.cells.map((cell, index) => {
    if (cell.kind !== 'letter') return '';
    if (!isPreviousSize) return russianLetter(values[index]);
    const row = Math.floor(index / puzzle.width);
    const column = index % puzzle.width;
    if (row >= previousHeight || column >= previousWidth) return '';
    return russianLetter(values[row * previousWidth + column]);
  });
}

export function createScanword({ id, width, height, previousSize = [width, height], entries }) {
  const cells = Array(width * height).fill(null);

  function indexAt(row, column) {
    if (row < 0 || row >= height || column < 0 || column >= width) {
      throw new Error('Scanword ' + id + ' has a cell outside the board');
    }
    return row * width + column;
  }

  const words = entries.map(([row, column, direction, answer, question], index) => {
    const step = scanwordDirections[direction];
    if (!step || !/^[А-ЯЁ]+$/.test(answer) || !question.trim()) {
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
      return position;
    });
    return { number: index + 1, clueIndex, direction, question, positions };
  });

  if (cells.includes(null)) throw new Error('Scanword ' + id + ' has unused cells');

  return { id, width, height, previousSize, cells, words };
}
