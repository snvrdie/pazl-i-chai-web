const digits = 0b111111111;
const sequence = Array.from({ length: 9 }, (_, index) => index);

export const sudokuRows = sequence.map((row) => sequence.map((column) => row * 9 + column));
export const sudokuColumns = sequence.map((column) => sequence.map((row) => row * 9 + column));
export const sudokuBoxes = sequence.map((box) => {
  const row = Math.floor(box / 3) * 3;
  const column = (box % 3) * 3;
  return sequence.map((offset) => (row + Math.floor(offset / 3)) * 9 + column + offset % 3);
});

const units = [...sudokuRows, ...sudokuColumns, ...sudokuBoxes];
const cellRows = Array.from({ length: 81 }, (_, index) => Math.floor(index / 9));
const cellColumns = cellRows.map((_, index) => index % 9);
const cellBoxes = cellRows.map((row, index) => Math.floor(row / 3) * 3 + Math.floor(cellColumns[index] / 3));
const bitCounts = Array.from({ length: digits + 1 }, (_, mask) => mask.toString(2).replaceAll('0', '').length);

export function solveSudoku(givens, limit = 1) {
  const values = [...givens];
  const rowMasks = new Uint16Array(9);
  const columnMasks = new Uint16Array(9);
  const boxMasks = new Uint16Array(9);
  let count = 0;
  let solution;

  function used(index) {
    return rowMasks[cellRows[index]] | columnMasks[cellColumns[index]] | boxMasks[cellBoxes[index]];
  }

  function toggle(index, bit) {
    rowMasks[cellRows[index]] ^= bit;
    columnMasks[cellColumns[index]] ^= bit;
    boxMasks[cellBoxes[index]] ^= bit;
  }

  for (const [index, value] of givens.entries()) {
    if (!value) continue;
    const bit = 1 << (value - 1);
    if (used(index) & bit) return { count: 0, solution };
    toggle(index, bit);
  }

  function search() {
    let cell = -1;
    let options = 0;
    let fewest = 10;
    for (let index = 0; index < 81; index += 1) {
      if (values[index]) continue;
      const mask = digits & ~used(index);
      if (!mask) return;
      const size = bitCounts[mask];
      if (size >= fewest) continue;
      cell = index;
      options = mask;
      fewest = size;
      if (size === 1) break;
    }
    if (cell === -1) {
      count += 1;
      solution ??= [...values];
      return;
    }
    while (options && count < limit) {
      const bit = options & -options;
      options ^= bit;
      values[cell] = Math.log2(bit) + 1;
      toggle(cell, bit);
      search();
      toggle(cell, bit);
    }
    values[cell] = 0;
  }

  search();
  return { count, solution };
}

export function findSudokuConflicts(values) {
  const conflicts = new Set();
  for (const unit of units) {
    const seen = Array(10).fill(-1);
    for (const index of unit) {
      const digit = values[index];
      if (!digit) continue;
      if (seen[digit] === -1) {
        seen[digit] = index;
      } else {
        conflicts.add(index);
        conflicts.add(seen[digit]);
      }
    }
  }
  return conflicts;
}
