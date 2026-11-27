const alphabet = {
  en: /^[A-Z]+$/,
  ru: /^[А-ЯЁ]+$/,
};

function isCell(size, index) {
  return Number.isInteger(index) && index >= 0 && index < size * size;
}

export function areAdjacent(size, first, second) {
  if (!isCell(size, first) || !isCell(size, second)) return false;
  const rowDistance = Math.abs(Math.floor(first / size) - Math.floor(second / size));
  const columnDistance = Math.abs(first % size - second % size);
  return rowDistance + columnDistance === 1;
}

export function createWordSearch(puzzle) {
  const { id, language, size, words } = puzzle;
  const isWord = alphabet[language];
  if (!Number.isInteger(size) || size < 2 || !isWord) {
    throw new Error('Invalid word search ' + id);
  }
  const letters = Array(size * size).fill('');
  const seen = new Set();
  for (const { text, path } of words) {
    if (!isWord.test(text) || seen.has(text) || text.length < 2 || text.length !== path.length) {
      throw new Error('Invalid word ' + text + ' in word search ' + id);
    }
    seen.add(text);
    for (const [offset, index] of path.entries()) {
      if (!isCell(size, index) || letters[index] || (offset && !areAdjacent(size, index, path[offset - 1]))) {
        throw new Error('Invalid path for ' + text + ' in word search ' + id);
      }
      letters[index] = text[offset];
    }
  }
  if (letters.includes('')) throw new Error('Unused cells in word search ' + id);
  return { ...puzzle, letters };
}

export function matchWord(puzzle, path) {
  return puzzle.words.find((word) => path.length === word.path.length && (
    word.path.every((index, offset) => index === path[offset])
    || word.path.every((index, offset) => index === path[path.length - 1 - offset])
  ));
}
