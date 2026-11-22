import { createScanword, matchesScanwordLetter, restoreScanwordValues, russianLetter, scanwordDirections } from './scanwords.js?v=zoom';
import { scanwordPuzzles } from './scanwords-puzzles.js?v=zoom';

const $ = (id) => document.getElementById(id);
// The original sparse grids keep their saves under a separate key.
const storageKey = 'puzzlemood-scanwords-v2';
const puzzles = scanwordPuzzles.map(createScanword);
const keyboardRows = ['ЙЦУКЕНГШЩЗХ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮЁЪ'];
const zoomLevels = [0.8, 1, 1.25, 1.5, 1.75, 2];
const defaultZoom = zoomLevels.indexOf(1);
const puzzleLink = ({ id }) => '#scanwords/' + id;
const moves = {
  ArrowLeft: [0, -1, 'r'],
  ArrowRight: [0, 1, 'r'],
  ArrowUp: [-1, 0, 'd'],
  ArrowDown: [1, 0, 'd'],
};

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
  } catch {
    // The puzzles are still available without local storage.
  }
  return {};
}

function letterCount(length) {
  return length + (length === 1 ? ' буква' : length >= 2 && length <= 4 ? ' буквы' : ' букв');
}

export function createScanwordsView() {
  const progress = readProgress();
  const play = $('scanwords-game');
  const grid = $('scanwords-grid');
  const scroll = $('scanwords-scroll');
  const zoomOut = $('scanwords-zoom-out');
  const zoomIn = $('scanwords-zoom-in');
  const zoomReset = $('scanwords-zoom-reset');
  const keyboard = $('scanwords-keyboard');
  const feedback = $('scanwords-feedback');
  const answersButton = $('scanwords-answers');
  let current;
  let values;
  let wordIndex = 0;
  let selected = 0;
  let complete = false;
  let showingAnswers = false;
  let zoomIndex = defaultZoom;
  let letters;
  let clues;

  function hasStarted(puzzle) {
    const saved = progress[puzzle.id]?.values;
    return Array.isArray(saved) && saved.some((value) => Boolean(value));
  }

  function hasFinished(puzzle) {
    const saved = progress[puzzle.id];
    return saved?.complete && saved.values?.length === puzzle.cells.length;
  }

  function renderLobby() {
    const remaining = puzzles.filter((puzzle) => !hasFinished(puzzle));
    const next = remaining.find(hasStarted) ?? remaining[0];
    const start = $('scanwords-start');
    start.hidden = !next;
    if (next) {
      start.href = puzzleLink(next);
      start.textContent = (hasStarted(next) ? 'продолжить сканворд ' : 'начать сканворд ') + next.id;
    }
    $('scanwords-total').textContent = (puzzles.length - remaining.length) + ' из ' + puzzles.length + ' решено';
    $('scanwords-options').replaceChildren(...puzzles.map((puzzle) => {
      const link = document.createElement('a');
      link.href = puzzleLink(puzzle);
      link.className = 'scanwords-option';
      const name = document.createElement('span');
      name.textContent = 'сканворд ' + puzzle.id;
      link.append(name);
      const status = hasFinished(puzzle) ? 'решён' : hasStarted(puzzle) ? 'в процессе' : '';
      if (status) {
        const label = document.createElement('small');
        label.textContent = status;
        link.append(label);
      }
      return link;
    }));
  }

  function axisOf(index) {
    return scanwordDirections[current.words[index].direction].axis;
  }

  function stopsAtBorder(cell, neighbour, axis) {
    if (neighbour?.kind !== 'letter') return false;
    const here = cell.words.find((index) => axisOf(index) === axis);
    const there = neighbour.words.find((index) => axisOf(index) === axis);
    return here !== there;
  }

  function buildGrid() {
    letters = new Map();
    clues = [];
    play.style.setProperty('--scanword-columns', current.width);
    play.style.setProperty('--scanword-rows', current.height);
    const rows = [];
    for (let rowIndex = 0; rowIndex < current.height; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'scanword-row';
      row.setAttribute('role', 'row');
      for (let column = 0; column < current.width; column += 1) {
        const index = rowIndex * current.width + column;
        const cell = current.cells[index];
        const tile = document.createElement('div');
        tile.className = 'scanword-tile';
        tile.setAttribute('role', 'gridcell');
        if (cell.kind === 'letter') {
          tile.classList.add('scanword-letter');
          if (column && stopsAtBorder(cell, current.cells[index - 1], 'r')) tile.classList.add('scanword-bar-left');
          if (rowIndex && stopsAtBorder(cell, current.cells[index - current.width], 'd')) tile.classList.add('scanword-bar-top');
          const button = document.createElement('button');
          button.type = 'button';
          const startArrows = cell.words.filter((wordIndex) => current.words[wordIndex].positions[0] === index)
            .map((wordIndex) => scanwordDirections[axisOf(wordIndex)].arrow);
          if (startArrows.length) button.dataset.arrows = startArrows.join(' ');
          button.addEventListener('click', () => selectCell(index));
          letters.set(index, { tile, button });
          tile.append(button);
        } else {
          tile.classList.add('scanword-clue-cell');
          for (const wordNumber of cell.words) {
            const word = current.words[wordNumber];
            const direction = scanwordDirections[word.direction];
            const button = document.createElement('button');
            button.type = 'button';
            button.tabIndex = -1;
            button.title = word.question;
            button.setAttribute('aria-label', 'вопрос ' + word.number + ', ' + direction.label + '. ' + word.question);
            button.addEventListener('click', () => selectWord(wordNumber, true));
            const text = document.createElement('span');
            text.className = 'scanword-clue-text';
            text.textContent = word.question;
            const marker = document.createElement('span');
            marker.className = 'scanword-clue-marker';
            marker.textContent = word.number + direction.arrow;
            marker.setAttribute('aria-hidden', 'true');
            button.append(text, marker);
            tile.append(button);
            clues[wordNumber] = button;
          }
        }
        row.append(tile);
      }
      rows.push(row);
    }
    grid.replaceChildren(...rows);
  }

  function correct(index) {
    return matchesScanwordLetter(values[index], current.cells[index].letter);
  }

  function showSelection(focus = false) {
    const { button } = letters.get(selected);
    const cell = button.getBoundingClientRect();
    const frame = scroll.getBoundingClientRect();
    const right = frame.left + scroll.clientWidth;
    const bottom = frame.top + scroll.clientHeight;
    const leftDelta = cell.left < frame.left ? cell.left - frame.left : Math.max(0, cell.right - right);
    const topDelta = cell.top < frame.top ? cell.top - frame.top : Math.max(0, cell.bottom - bottom);
    if (leftDelta || topDelta) scroll.scrollBy(leftDelta, topDelta);
    if (focus) button.focus({ preventScroll: true });
  }

  function setZoom(index) {
    zoomIndex = index;
    const zoom = zoomLevels[index];
    const percentage = Math.round(zoom * 100) + '%';
    grid.style.setProperty('--scanword-zoom', zoom);
    zoomReset.textContent = percentage;
    zoomReset.setAttribute('aria-label', 'сбросить масштаб, сейчас ' + percentage);
    zoomOut.disabled = index === 0;
    zoomIn.disabled = index === zoomLevels.length - 1;
    if (letters) showSelection();
  }

  function renderGame() {
    const word = current.words[wordIndex];
    const direction = scanwordDirections[word.direction];
    const question = $('scanwords-clue-question');
    if (question.textContent !== word.question) {
      $('scanwords-clue-number').textContent = word.number + ' ' + direction.arrow + ' · ' + letterCount(word.positions.length);
      question.textContent = word.question;
    }
    const solved = current.words.filter((item) => item.positions.every(correct)).length;
    $('scanwords-solved').textContent = solved + ' из ' + current.words.length + ' разгадано';
    for (const [index, { tile, button }] of letters.entries()) {
      tile.classList.toggle('is-word', word.positions.includes(index));
      tile.setAttribute('aria-selected', String(index === selected));
      tile.setAttribute('aria-readonly', String(complete || showingAnswers));
      button.tabIndex = index === selected ? 0 : -1;
      button.textContent = showingAnswers ? current.cells[index].letter : values[index];
      const row = Math.floor(index / current.width) + 1;
      const column = index % current.width + 1;
      button.setAttribute('aria-label', 'строка ' + row + ', клетка ' + column + ', ' + (button.textContent || 'пусто'));
    }
    clues.forEach((button, index) => button.setAttribute('aria-pressed', String(index === wordIndex)));
    grid.classList.toggle('showing-answers', showingAnswers);
    answersButton.setAttribute('aria-pressed', String(showingAnswers));
    answersButton.textContent = showingAnswers ? 'скрыть ответы' : 'ответы';
    for (const button of keyboard.querySelectorAll('button')) button.disabled = complete || showingAnswers;
    $('scanwords-erase').disabled = complete || showingAnswers;
    const nextLink = $('scanwords-next');
    nextLink.hidden = !complete;
    if (complete) {
      const next = puzzles.find((puzzle) => puzzle !== current && !hasFinished(puzzle));
      nextLink.href = next ? puzzleLink(next) : '#scanwords';
      nextLink.textContent = next ? 'следующий сканворд' : 'к сканвордам';
    }
  }

  function selectWord(index, focus = false) {
    wordIndex = index;
    const positions = current.words[index].positions;
    selected = positions.find((position) => !values[position]) ?? positions[0];
    renderGame();
    showSelection(focus);
  }

  function selectCell(index, preferredDirection) {
    const options = current.cells[index].words;
    const preferred = options.find((item) => axisOf(item) === preferredDirection);
    if (preferred !== undefined) wordIndex = preferred;
    else if (!options.includes(wordIndex)) wordIndex = options[0];
    else if (!preferredDirection && index === selected && options.length > 1) {
      wordIndex = options.find((item) => item !== wordIndex);
    }
    selected = index;
    renderGame();
    showSelection(true);
  }

  function save() {
    const saved = { values, complete };
    progress[current.id] = saved;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...progress, ...readProgress(), [current.id]: saved }));
    } catch {
      // Keep this session playable if browser storage is unavailable.
    }
  }

  function enter(letter, backward = false) {
    if (complete || showingAnswers) return;
    const positions = current.words[wordIndex].positions;
    const offset = positions.indexOf(selected);
    if (backward && !values[selected] && offset > 0) selected = positions[offset - 1];
    values[selected] = letter;
    if (letter && offset + 1 < positions.length) selected = positions[offset + 1];
    complete = [...letters.keys()].every(correct);
    save();
    feedback.textContent = complete ? 'все слова разгаданы.' : '';
    renderGame();
    showSelection(true);
  }

  function open(id = '') {
    Object.assign(progress, readProgress());
    const puzzle = puzzles.find((item) => item.id === id);
    $('scanwords-lobby').hidden = Boolean(puzzle);
    play.hidden = !puzzle;
    if (!puzzle) {
      renderLobby();
      $('scanwords-title').focus({ preventScroll: true });
      return;
    }
    showingAnswers = false;
    if (puzzle !== current) {
      current = puzzle;
      values = restoreScanwordValues(current, progress[id]?.values);
      buildGrid();
      scroll.scrollTo(0, 0);
      $('scanwords-clue-question').textContent = '';
      complete = [...letters.keys()].every(correct);
      const nextWord = current.words.findIndex((word) => word.positions.some((index) => !values[index]));
      selectWord(Math.max(0, nextWord));
    }
    $('scanwords-game-title').textContent = 'сканворд ' + id;
    feedback.textContent = complete ? 'все слова разгаданы.' : '';
    renderGame();
    $('scanwords-game-title').focus({ preventScroll: true });
  }

  for (const row of keyboardRows) {
    for (const letter of row) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = letter;
      button.addEventListener('click', () => enter(letter));
      keyboard.append(button);
    }
  }
  $('scanwords-prev-clue').addEventListener('click', () => selectWord((wordIndex + current.words.length - 1) % current.words.length));
  $('scanwords-next-clue').addEventListener('click', () => selectWord((wordIndex + 1) % current.words.length));
  $('scanwords-erase').addEventListener('click', () => enter(''));
  zoomOut.addEventListener('click', () => setZoom(zoomIndex - 1));
  zoomIn.addEventListener('click', () => setZoom(zoomIndex + 1));
  zoomReset.addEventListener('click', () => setZoom(defaultZoom));
  answersButton.addEventListener('click', () => {
    showingAnswers = !showingAnswers;
    feedback.textContent = showingAnswers ? 'показана заполненная сетка.' : complete ? 'все слова разгаданы.' : '';
    renderGame();
  });
  play.addEventListener('keydown', (event) => {
    if (!current || event.altKey || event.ctrlKey || event.metaKey) return;
    const letter = russianLetter(event.key);
    const move = moves[event.key];
    if (letter) enter(letter);
    else if (event.key === 'Backspace' || event.key === 'Delete') enter('', event.key === 'Backspace');
    else if (move && grid.contains(event.target)) {
      const [rowStep, columnStep, direction] = move;
      const row = Math.floor(selected / current.width) + rowStep;
      const column = selected % current.width + columnStep;
      if (row >= 0 && row < current.height && column >= 0 && column < current.width && letters.has(row * current.width + column)) {
        selectCell(row * current.width + column, direction);
      }
    } else return;
    event.preventDefault();
  });

  return { open };
}
