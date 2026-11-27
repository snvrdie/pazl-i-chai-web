// Monoline Cyrillic capitals and numerals, drawn as quick pen strokes.
const glyphs = {
  '1': 'M6 10 Q9 8 13 4 Q12 16 11 26',
  '2': 'M5 9 C6 4 12 2 16 6 C20 11 9 21 4 25 Q12 23 20 24',
  '3': 'M5 6 Q12 2 18 5 Q17 9 11 13 C23 11 21 23 13 26 Q8 27 4 23',
  '4': 'M13 4 L4 18 Q11 17 20 17 M16 10 Q15 18 15 27',
  '5': 'M19 4 Q12 6 7 5 L5 15 C18 8 23 21 14 25 Q8 28 4 23',
  '6': 'M17 4 C10 5 4 12 5 21 C6 29 18 27 19 19 C20 13 11 12 6 17',
  '7': 'M4 6 Q12 4 20 5 C15 12 12 19 9 27 M7 15 L17 14',
  '8': 'M13 14 C4 10 5 4 12 4 C21 3 21 9 13 14 C4 18 2 25 11 26 C21 28 23 19 13 14',
  '9': 'M18 13 C14 19 3 17 5 10 C6 4 14 1 18 6 C23 11 17 23 9 27',
  А: 'M3 26 Q8 14 13 4 Q17 13 20 26 M6 19 L17 17',
  Б: 'M19 5 Q12 6 6 6 L5 25 C12 27 22 24 20 17 Q18 13 6 14',
  В: 'M6 6 L5 26 M6 6 C23 0 23 12 9 14 C24 11 25 26 5 26',
  Г: 'M5 26 Q6 15 6 6 Q13 6 20 4',
  Д: 'M2 28 L3 23 Q12 22 21 23 L22 28 M5 23 C9 19 10 10 11 6 L17 5 L18 23',
  Е: 'M19 5 L6 6 Q5 17 5 26 L20 24 M6 16 L16 15',
  Ё: 'M19 8 L6 9 L5 26 L20 25 M6 17 L16 16 M8 4 l.5 -.5 M15 3.5 l.5 -.5',
  Ж: 'M12 5 Q12 15 12 26 M3 6 L12 15 L2 25 M21 4 L12 15 L22 24',
  З: 'M5 7 C14 1 22 6 17 11 Q15 13 10 15 C25 13 22 27 12 27 Q7 27 3 23',
  И: 'M5 5 Q4 17 5 26 Q13 17 20 5 Q19 17 20 26',
  Й: 'M5 8 L5 26 Q13 18 20 8 L20 25 M8 2 Q10 8 16 2',
  К: 'M6 5 Q5 16 5 26 M20 5 L6 17 Q12 18 21 26',
  Л: 'M2 25 Q5 28 7 22 Q10 14 13 5 Q17 11 21 26',
  М: 'M3 26 Q5 14 6 5 L12 19 Q16 11 20 5 Q20 16 22 25',
  Н: 'M5 5 Q6 17 4 26 M19 4 Q18 16 19 25 M6 16 L18 14',
  О: 'M15 5 C9 2 4 10 4 19 C4 27 12 29 17 23 C23 16 22 6 15 5 Z',
  П: 'M4 26 Q5 16 5 6 L20 5 Q18 16 19 26',
  Р: 'M5 26 L6 6 C12 3 21 3 21 9 C20 16 11 17 6 16',
  С: 'M20 7 C13 1 5 7 4 17 C2 25 11 29 20 23',
  Т: 'M3 6 Q12 6 22 4 M13 6 L12 26',
  У: 'M4 5 Q9 14 13 17 M20 5 Q14 21 8 26',
  Ф: 'M13 4 L12 27 M12 9 C2 9 1 21 11 21 C24 21 25 8 12 9 Z',
  Х: 'M4 5 Q12 15 21 25 M20 5 Q15 11 3 26',
  Ц: 'M4 5 L4 25 L19 24 L20 5 M18 24 L22 24 L21 29',
  Ч: 'M5 5 C3 16 7 17 19 14 M20 4 Q18 15 19 26',
  Ш: 'M3 6 L3 25 L21 24 L21 5 M12 6 L12 24',
  Щ: 'M3 6 L3 25 L21 24 L21 5 M12 6 L12 24 M20 24 L23 24 L22 29',
  Ъ: 'M2 6 L8 6 L7 25 C23 28 25 12 8 16',
  Ы: 'M3 5 L3 25 C16 28 20 12 4 16 M21 5 L20 25',
  Ь: 'M6 5 Q5 16 5 25 C21 28 25 12 6 15',
  Э: 'M4 7 C11 2 21 4 21 14 C22 23 14 30 4 24 M9 16 L20 15',
  Ю: 'M3 5 L3 26 M3 16 L9 15 M16 5 C10 5 8 13 9 20 C10 27 19 28 22 20 C25 11 22 4 16 5 Z',
  Я: 'M19 26 L20 5 C12 2 4 6 5 12 Q7 17 19 15 M14 15 L3 26',
};

const svgNS = 'http://www.w3.org/2000/svg';

export function renderPuzzleMark(mark, value, handwritten) {
  const text = String(value || '');
  const strokes = handwritten && glyphs[text];
  if (strokes && mark.dataset.glyph === text) return;

  mark.classList.toggle('puzzle-ink', Boolean(strokes));
  if (!strokes) {
    delete mark.dataset.glyph;
    if (mark.firstElementChild || mark.textContent !== text) mark.textContent = text;
    return;
  }

  const drawing = document.createElementNS(svgNS, 'svg');
  drawing.setAttribute('viewBox', '0 0 24 30');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', strokes);
  drawing.append(path);
  mark.dataset.glyph = text;
  mark.replaceChildren(drawing);
}
