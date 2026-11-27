import { renderPuzzleMark } from './puzzle-ink.js';
import { createScanword, matchesScanwordCode, matchesScanwordLetter, restoreScanwordValues, russianLetter, scanwordDirections } from './scanwords.js?v=puzzle-layout';
import { scanwordPuzzles } from './scanwords-puzzles.js?v=balanced';

const $ = (id) => document.getElementById(id);
// The original sparse grids keep their saves under a separate key.
const storageKey = 'puzzlemood-scanwords-v2';
const puzzles = scanwordPuzzles.map(createScanword);
const catalogue = [...puzzles].sort((first, second) => Number(first.id) - Number(second.id));
const linkedPuzzles = puzzles.filter((puzzle) => puzzle.code);
const nativeInputMarker = '\u200b';
const zoomLevels = [0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4];
const defaultZoom = zoomLevels.indexOf(1);
const puzzleLink = ({ id }) => '#scanwords/' + id;
const isPageSize = ({ width, height }) => width >= 18 && height >= 18;
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
  const nativeInput = $('scanwords-entry');
  const feedback = $('scanwords-feedback');
  const answersButton = $('scanwords-answers');
  const codeButton = $('scanwords-code-open');
  const codeDialog = $('scanwords-code-dialog');
  const codeSlots = $('scanwords-code-slots');
  const codeCheck = $('scanwords-code-check');
  const codeNext = $('scanwords-code-next');
  const codeFeedback = $('scanwords-code-feedback');
  let current;
  let values;
  let wordIndex = 0;
  let selected = 0;
  let lastClickedCell;
  let complete = false;
  let showingAnswers = false;
  let zoomIndex = defaultZoom;
  let letters;
  let clues;
  let shared;

  function hasStarted(puzzle) {
    const saved = progress[puzzle.id]?.values;
    return Array.isArray(saved) && saved.some((value) => Boolean(value));
  }

  function hasFinished(puzzle) {
    const saved = progress[puzzle.id];
    return saved?.complete && saved.values?.length === puzzle.cells.length;
  }

  function hasCode(puzzle) {
    return progress[puzzle.id]?.codeSolved === true;
  }

  function prerequisite(puzzle) {
    return linkedPuzzles[linkedPuzzles.indexOf(puzzle) - 1];
  }

  function canOpen(puzzle) {
    const previous = prerequisite(puzzle);
    return !previous || hasCode(previous);
  }

  function renderLobby(locked) {
    const remaining = puzzles.filter((puzzle) => canOpen(puzzle) && !hasFinished(puzzle));
    const fullPages = remaining.filter(isPageSize);
    const nextChapter = linkedPuzzles.find((puzzle) => canOpen(puzzle) && !hasCode(puzzle));
    const next = nextChapter ?? fullPages.find(hasStarted) ?? fullPages[0] ?? remaining.find(hasStarted) ?? remaining[0];
    const start = $('scanwords-start');
    start.hidden = !next;
    if (next) {
      start.href = puzzleLink(next);
      start.textContent = (hasStarted(next) ? 'продолжить сканворд ' : 'начать сканворд ') + next.id;
    }
    $('scanwords-total').textContent = puzzles.filter(hasFinished).length + ' из ' + puzzles.length + ' решено';
    $('scanwords-locked').textContent = locked
      ? 'сканворд ' + locked.id + ' откроется после кодового слова в сканворде ' + prerequisite(locked).id + '.'
      : '';
    const fullPageCards = [];
    const compactCards = [];
    for (const puzzle of catalogue) {
      const unlocked = canOpen(puzzle);
      const card = document.createElement(unlocked ? 'a' : 'div');
      if (unlocked) card.href = puzzleLink(puzzle);
      card.className = 'scanwords-option';
      card.classList.toggle('is-linked', Boolean(puzzle.code));
      card.classList.toggle('is-locked', !unlocked);
      const name = document.createElement('span');
      name.textContent = 'сканворд ' + puzzle.id;
      const size = document.createElement('small');
      const details = [puzzle.width + ' × ' + puzzle.height, puzzle.words.length + ' вопросов'];
      if (!unlocked) details.push('код из сканворда ' + prerequisite(puzzle).id);
      else if (hasFinished(puzzle)) details.push('решён');
      else if (hasCode(puzzle)) details.push('код найден');
      else if (hasStarted(puzzle)) details.push('в процессе');
      else if (puzzle.code) details.push('с кодовым словом');
      size.textContent = details.join(' · ');
      card.append(name, size);
      (isPageSize(puzzle) ? fullPageCards : compactCards).push(card);
    }
    $('scanwords-options').replaceChildren(...fullPageCards);
    $('scanwords-compact-options').replaceChildren(...compactCards);
  }

  function axisOf(index) {
    return scanwordDirections[current.words[index].direction].axis;
  }

  function buildGrid() {
    letters = new Map();
    clues = [];
    play.style.setProperty('--scanword-columns', current.width);
    play.style.setProperty('--scanword-rows', current.height);
    const codeIndexes = new Map(current.code?.positions.map((position, index) => [position, index + 1]));
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
          if (cell.barLeft) tile.classList.add('scanword-bar-left');
          if (cell.barTop) tile.classList.add('scanword-bar-top');
          const button = document.createElement('button');
          button.type = 'button';
          const startArrows = cell.words.filter((wordIndex) => current.words[wordIndex].positions[0] === index)
            .map((wordIndex) => scanwordDirections[axisOf(wordIndex)].arrow);
          if (startArrows.length) button.dataset.arrows = startArrows.join(' ');
          button.addEventListener('click', (event) => {
            const useNativeInput = event.pointerType === 'touch' || event.pointerType === 'pen';
            selectCell(index, undefined, useNativeInput);
          });
          const mark = document.createElement('span');
          mark.setAttribute('aria-hidden', 'true');
          button.append(mark);
          const codeIndex = codeIndexes.get(index);
          if (codeIndex) {
            tile.classList.add('is-code-cell');
            const number = document.createElement('span');
            number.className = 'scanword-code-index';
            number.textContent = codeIndex;
            number.setAttribute('aria-hidden', 'true');
            button.append(number);
          }
          letters.set(index, { tile, button, mark, codeIndex });
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
            const number = document.createElement('span');
            number.className = 'scanword-clue-index';
            number.textContent = word.number;
            marker.append(number, direction.arrow);
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

  function showSelection(focus = false, useNativeInput = false) {
    const { button } = letters.get(selected);
    const cell = button.getBoundingClientRect();
    const frame = scroll.getBoundingClientRect();
    const right = frame.left + scroll.clientWidth;
    const bottom = frame.top + scroll.clientHeight;
    const leftDelta = cell.left < frame.left ? cell.left - frame.left : Math.max(0, cell.right - right);
    const topDelta = cell.top < frame.top ? cell.top - frame.top : Math.max(0, cell.bottom - bottom);
    if (leftDelta || topDelta) scroll.scrollBy(leftDelta, topDelta);
    if (focus) {
      const target = !nativeInput.disabled && (useNativeInput || document.activeElement === nativeInput) ? nativeInput : button;
      target.focus({ preventScroll: true });
    }
  }

  function setZoom(index) {
    zoomIndex = index;
    const zoom = zoomLevels[index];
    const percentage = Math.round(zoom * 100) + '%';
    grid.style.setProperty('--scanword-zoom', zoom);
    zoomReset.textContent = percentage;
    zoomReset.setAttribute('aria-label', 'вписать поле целиком, сейчас ' + percentage);
    zoomOut.disabled = index === 0;
    zoomIn.disabled = index === zoomLevels.length - 1;
    if (index > defaultZoom && letters) showSelection();
    else scroll.scrollTo(0, 0);
  }

  function renderGame() {
    const word = current.words[wordIndex];
    const direction = scanwordDirections[word.direction];
    const question = $('scanwords-clue-question');
    $('scanwords-clue-number').textContent = word.number + ' ' + direction.arrow + ' · ' + letterCount(word.positions.length);
    if (question.textContent !== word.question) question.textContent = word.question;
    const solved = current.words.filter((item) => item.positions.every(correct)).length;
    $('scanwords-solved').textContent = solved + ' из ' + current.words.length + ' разгадано';
    for (const [index, { tile, button, mark, codeIndex }] of letters.entries()) {
      tile.classList.toggle('is-word', word.positions.includes(index));
      tile.setAttribute('aria-selected', String(index === selected));
      tile.setAttribute('aria-readonly', String(complete || showingAnswers));
      button.tabIndex = index === selected ? 0 : -1;
      const letter = showingAnswers ? current.cells[index].letter : values[index];
      renderPuzzleMark(mark, letter, !showingAnswers);
      const row = Math.floor(index / current.width) + 1;
      const column = index % current.width + 1;
      const codeLabel = codeIndex ? ', кодовая клетка ' + codeIndex : '';
      button.setAttribute('aria-label', 'строка ' + row + ', клетка ' + column + ', ' + (letter || 'пусто') + codeLabel);
    }
    clues.forEach((button, index) => button.setAttribute('aria-pressed', String(index === wordIndex)));
    grid.classList.toggle('showing-answers', showingAnswers);
    answersButton.setAttribute('aria-pressed', String(showingAnswers));
    answersButton.textContent = showingAnswers ? 'скрыть ответы' : 'ответы';
    nativeInput.disabled = complete || showingAnswers;
    $('scanwords-erase').disabled = complete || showingAnswers;
    codeButton.hidden = !current.code;
    const codeSolved = shared ? shared.state.codeSolved : hasCode(current);
    codeButton.classList.toggle('is-solved', codeSolved);
    codeButton.setAttribute('aria-label', codeSolved ? 'кодовое слово, код принят' : 'кодовое слово');
    const nextLink = $('scanwords-next');
    nextLink.hidden = !complete || Boolean(current.code) || Boolean(shared);
    if (!nextLink.hidden) {
      const next = puzzles.find((puzzle) => puzzle !== current && canOpen(puzzle) && !hasFinished(puzzle));
      nextLink.href = next ? puzzleLink(next) : '#scanwords';
      nextLink.textContent = next ? 'следующий сканворд' : 'к сканвордам';
    }
  }

  function selectWord(index, focus = false, useNativeInput = false) {
    wordIndex = index;
    lastClickedCell = undefined;
    const positions = current.words[index].positions;
    selected = positions.find((position) => !values[position]) ?? positions[0];
    renderGame();
    showSelection(focus, useNativeInput);
  }

  function stepClue(offset, event) {
    const count = current.words.length;
    const useNativeInput = event.pointerType === 'touch' || event.pointerType === 'pen'
      || (!event.pointerType && event.detail > 0 && window.matchMedia('(pointer: coarse)').matches);
    selectWord((wordIndex + offset + count) % count, true, useNativeInput);
  }

  function selectCell(index, preferredDirection, useNativeInput = false) {
    const options = current.cells[index].words;
    const preferred = options.find((item) => axisOf(item) === preferredDirection);
    if (preferred !== undefined) wordIndex = preferred;
    else if (!options.includes(wordIndex)) wordIndex = options[0];
    else if (!preferredDirection && index === selected && index === lastClickedCell && options.length > 1) {
      wordIndex = options.find((item) => item !== wordIndex);
    }
    selected = index;
    lastClickedCell = preferredDirection ? undefined : index;
    renderGame();
    showSelection(true, useNativeInput);
  }

  function saveProgress(changes) {
    const latest = readProgress();
    const id = current.id;
    const saved = { ...progress[id], ...latest[id], ...changes };
    Object.assign(progress, latest, { [id]: saved });
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      // Keep this session playable if browser storage is unavailable.
    }
  }

  function closeCode() {
    if (codeDialog.open) codeDialog.close();
  }

  function renderCode() {
    const solved = shared ? shared.state.codeSolved : hasCode(current);
    const next = linkedPuzzles[linkedPuzzles.indexOf(current) + 1];
    codeSlots.replaceChildren(...current.code.positions.map((position, index) => {
      const button = document.createElement('button');
      button.className = 'scanwords-code-slot';
      button.type = 'button';
      const number = document.createElement('span');
      number.textContent = index + 1;
      const letter = document.createElement('strong');
      letter.textContent = solved ? current.code.word[index] : values[position];
      button.setAttribute('aria-label', 'кодовая клетка ' + (index + 1) + ', ' + (letter.textContent || 'пусто'));
      button.append(number, letter);
      button.addEventListener('click', () => {
        closeCode();
        selectCell(position);
      });
      return button;
    }));
    codeCheck.hidden = solved;
    codeNext.hidden = !solved || Boolean(shared);
    codeNext.href = next ? puzzleLink(next) : '#scanwords';
    codeNext.textContent = next ? 'открыть сканворд ' + next.id : 'к сканвордам';
    codeFeedback.textContent = '';
    if (solved) codeFeedback.textContent = shared ? 'код принят.' : next ? 'код принят. следующий сканворд открыт.' : 'все кодовые слова собраны.';
  }

  function enter(letter, backward = false) {
    if (complete || showingAnswers) return;
    const positions = current.words[wordIndex].positions;
    const offset = positions.indexOf(selected);
    if (backward && !values[selected] && offset > 0) selected = positions[offset - 1];
    const index = selected;
    if (letter && offset + 1 < positions.length) selected = positions[offset + 1];
    if (shared) {
      shared.send({ type: 'cell', index, value: letter });
      renderGame();
      showSelection(true);
      return;
    }
    values[index] = letter;
    complete = [...letters.keys()].every(correct);
    saveProgress({ values, complete, revision: current.revision });
    feedback.textContent = complete ? 'все слова разгаданы.' : '';
    renderGame();
    showSelection(true);
  }

  function updateRoom(state) {
    ({ values, complete } = state);
    if (!showingAnswers) feedback.textContent = complete ? 'все слова разгаданы.' : '';
    renderGame();
    if (codeDialog.open) renderCode();
  }

  function open(id = '', room) {
    closeCode();
    Object.assign(progress, readProgress());
    const requested = puzzles.find((item) => item.id === id);
    const locked = requested && !room && !canOpen(requested) ? requested : undefined;
    const puzzle = locked ? undefined : requested;
    $('scanwords-lobby').hidden = Boolean(puzzle);
    play.hidden = !puzzle;
    if (!puzzle) {
      renderLobby(locked);
      if (locked) $('scanwords-locked').focus();
      else $('scanwords-title').focus({ preventScroll: true });
      return;
    }
    showingAnswers = false;
    setZoom(defaultZoom);
    if (puzzle !== current || shared !== room) {
      current = puzzle;
      shared = room;
      const saved = progress[id];
      values = shared ? shared.state.values : restoreScanwordValues(current, saved?.values, saved?.revision);
      buildGrid();
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

  nativeInput.value = nativeInputMarker;
  nativeInput.addEventListener('input', (event) => {
    if (event.isComposing) return;
    const letter = Array.from(nativeInput.value.normalize('NFC'), russianLetter).find(Boolean);
    nativeInput.value = nativeInputMarker;
    if (event.inputType?.startsWith('delete')) enter('', true);
    else if (letter) enter(letter);
  });
  $('scanwords-prev-clue').addEventListener('click', (event) => stepClue(-1, event));
  $('scanwords-next-clue').addEventListener('click', (event) => stepClue(1, event));
  $('scanwords-erase').addEventListener('click', () => enter(''));
  zoomOut.addEventListener('click', () => setZoom(zoomIndex - 1));
  zoomIn.addEventListener('click', () => setZoom(zoomIndex + 1));
  zoomReset.addEventListener('click', () => setZoom(defaultZoom));
  codeButton.addEventListener('click', () => {
    renderCode();
    codeDialog.showModal();
  });
  codeCheck.addEventListener('click', () => {
    if (current.code.positions.some((position) => !values[position])) {
      codeFeedback.textContent = 'заполните все отмеченные клетки.';
    } else if (!matchesScanwordCode(values, current.code)) {
      codeFeedback.textContent = 'код не подходит. проверьте буквы в отмеченных клетках.';
    } else if (shared) {
      shared.send({ type: 'code' });
      codeDialog.querySelector('[autofocus]').focus();
    } else {
      saveProgress({ codeSolved: true });
      renderGame();
      renderCode();
      codeNext.focus();
    }
  });
  answersButton.addEventListener('click', () => {
    showingAnswers = !showingAnswers;
    feedback.textContent = showingAnswers ? 'показана заполненная сетка.' : complete ? 'все слова разгаданы.' : '';
    renderGame();
  });
  play.addEventListener('keydown', (event) => {
    if (!current || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const letter = russianLetter(event.key);
    const move = moves[event.key];
    if (event.target === nativeInput && !move) return;
    if (letter) enter(letter);
    else if (event.key === 'Backspace' || event.key === 'Delete') enter('', event.key === 'Backspace');
    else if (move && (grid.contains(event.target) || event.target === nativeInput)) {
      const [rowStep, columnStep, direction] = move;
      const row = Math.floor(selected / current.width) + rowStep;
      const column = selected % current.width + columnStep;
      if (row >= 0 && row < current.height && column >= 0 && column < current.width && letters.has(row * current.width + column)) {
        selectCell(row * current.width + column, direction);
      }
    } else return;
    event.preventDefault();
  });

  return { open, closeCode, updateRoom };
}
