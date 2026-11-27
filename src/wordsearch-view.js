import { areAdjacent, createWordSearch, matchWord } from './wordsearch.js?v=fillwords';
import { wordSearchPuzzles } from './wordsearch-puzzles.js?v=untitled';
import { drawWordsearchInk } from './wordsearch-ink.js';

const $ = (id) => document.getElementById(id);
const storageKey = 'puzzlemood-wordsearch-v1';
const puzzles = wordSearchPuzzles.map(createWordSearch);
const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const labels = {
  en: {
    title: 'word searches',
    games: 'all games',
    back: 'all word searches',
    language: 'puzzle language',
    intro: 'find every word in the grid. follow neighbouring letters horizontally or vertically, and turn corners along the way.',
    grid: 'word search grid',
    words: 'words to find',
    progress: (count, total) => count + ' of ' + total + ' found',
    position: (row, column) => 'row ' + row + ', column ' + column,
    clear: 'clear selection',
    help: 'drag across the letters or tap them one by one. use arrow keys to move and space to select.',
    found: 'found',
    complete: 'you found every word.',
    next: 'next puzzle',
  },
  ru: {
    title: 'филворды',
    games: 'все игры',
    back: 'все филворды',
    language: 'язык игры',
    intro: 'найдите все слова в сетке. ведите линию по соседним буквам вправо, влево, вверх или вниз. можно поворачивать.',
    grid: 'поле филворда',
    words: 'слова для поиска',
    progress: (count, total) => 'найдено ' + count + ' из ' + total,
    position: (row, column) => 'строка ' + row + ', столбец ' + column,
    clear: 'сбросить выделение',
    help: 'проведите по буквам или нажмите их по очереди. с клавиатуры используйте стрелки и пробел.',
    found: 'найдено',
    complete: 'все слова найдены.',
    next: 'следующий филворд',
  },
};

function readProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    // Keep the game available when storage is disabled.
  }
  return {};
}

function puzzleLink(id) {
  return '#wordsearch/' + id;
}

export function createWordsearchView() {
  const view = $('wordsearch-view');
  const grid = $('wordsearch-grid');
  const ink = $('wordsearch-ink');
  const list = $('wordsearch-words');
  const clear = $('wordsearch-clear');
  const result = $('wordsearch-result');
  const next = $('wordsearch-next');
  const progress = readProgress();
  let copy;
  let group;
  let current;
  let cells;
  let wordItems;
  let cursor = 0;
  let selection = [];
  let found;
  let foundPaths = [];
  let locked;
  let pointer;
  let shared;

  function savedWords(puzzle) {
    const saved = progress[puzzle.id];
    return new Set(puzzle.words.filter(({ text }) => Array.isArray(saved) && saved.includes(text)).map(({ text }) => text));
  }

  function buildLobby() {
    $('wordsearch-puzzles').replaceChildren(...group.map((puzzle) => {
      const link = document.createElement('a');
      link.href = puzzleLink(puzzle.id);
      link.className = 'wordsearch-puzzle';
      const dimensions = document.createElement('strong');
      dimensions.textContent = puzzle.size + ' × ' + puzzle.size;
      const detail = document.createElement('span');
      detail.textContent = copy.progress(savedWords(puzzle).size, puzzle.words.length);
      link.append(dimensions, detail);
      return link;
    }));
  }

  function buildGame() {
    grid.setAttribute('aria-label', copy.grid);
    grid.style.setProperty('--wordsearch-size', current.size);
    cells = [];
    const rows = [];
    for (let row = 0; row < current.size; row += 1) {
      const rowElement = document.createElement('div');
      rowElement.className = 'wordsearch-row';
      rowElement.setAttribute('role', 'row');
      for (let column = 0; column < current.size; column += 1) {
        const index = row * current.size + column;
        const tile = document.createElement('div');
        tile.className = 'wordsearch-tile';
        tile.setAttribute('role', 'gridcell');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'wordsearch-cell';
        button.tabIndex = index === cursor ? 0 : -1;
        button.dataset.index = index;
        button.textContent = current.letters[index];
        button.setAttribute('aria-label', button.textContent + ', ' + copy.position(row + 1, column + 1));
        tile.append(button);
        rowElement.append(tile);
        cells.push({ tile, button });
      }
      rows.push(rowElement);
    }
    grid.replaceChildren(...rows);
    list.setAttribute('aria-label', copy.words);
    wordItems = current.words.map(({ text }) => {
      const item = document.createElement('li');
      item.textContent = text.toLocaleLowerCase(current.language);
      return item;
    });
    list.replaceChildren(...wordItems);
  }

  function drawInk() {
    if (!current) return;
    const path = pointer && !pointer.dragged && !selection.length ? [pointer.start] : selection;
    drawWordsearchInk(ink, current.size, foundPaths, path);
  }

  function renderSelection() {
    const selected = new Set(selection);
    cells.forEach(({ tile }, index) => tile.setAttribute('aria-selected', String(selected.has(index))));
    clear.disabled = !selection.length;
    drawInk();
  }

  function renderProgress() {
    foundPaths = current.words.filter(({ text }) => found.has(text)).map(({ path }) => path);
    locked = new Set(foundPaths.flat());
    if (selection.some((index) => locked.has(index))) selection = [];
    if (pointer && locked.has(pointer.start)) pointer = undefined;
    cells.forEach(({ button }, index) => button.setAttribute('aria-disabled', String(locked.has(index))));
    wordItems.forEach((item, index) => {
      const solved = found.has(current.words[index].text);
      item.classList.toggle('is-found', solved);
      item.setAttribute('aria-label', item.textContent + (solved ? ', ' + copy.found : ''));
    });
    $('wordsearch-progress').textContent = copy.progress(found.size, current.words.length);
    const complete = found.size === current.words.length;
    result.hidden = !complete;
    result.textContent = complete ? copy.complete : '';
    next.hidden = !complete || Boolean(shared);
    if (!next.hidden) {
      const remaining = group.filter((puzzle) => savedWords(puzzle).size < puzzle.words.length);
      const following = remaining.find((puzzle) => group.indexOf(puzzle) > group.indexOf(current)) ?? remaining[0];
      next.href = puzzleLink(following?.id ?? current.language);
      next.textContent = following ? copy.next : copy.back;
    }
    renderSelection();
  }

  function focusCell(index, reveal = false) {
    cells[cursor].button.tabIndex = -1;
    cursor = index;
    const { button } = cells[cursor];
    button.tabIndex = 0;
    button.focus({ preventScroll: true });
    if (reveal) button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function save() {
    progress[current.id] = [...found];
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...progress, ...readProgress(), [current.id]: progress[current.id] }));
    } catch {
      // Keep progress in memory for this visit.
    }
  }

  function extend(index, bridge = false) {
    if (locked.has(index)) return false;
    const previous = selection.indexOf(index);
    if (previous !== -1) {
      selection.length = previous + 1;
      return true;
    }
    const last = selection.at(-1);
    if (last === undefined || areAdjacent(current.size, last, index)) {
      selection.push(index);
      return true;
    }
    if (!bridge) return false;

    const delta = Math.sign(index - last);
    const sameRow = Math.floor(index / current.size) === Math.floor(last / current.size);
    const sameColumn = index % current.size === last % current.size;
    if (!sameRow && !sameColumn) return false;
    const step = sameRow ? delta : delta * current.size;
    const between = [];
    for (let cell = last + step; cell !== index; cell += step) {
      if (locked.has(cell) || selection.includes(cell)) return false;
      between.push(cell);
    }
    selection.push(...between, index);
    return true;
  }

  function finishSelection() {
    if (selection.length < 2) return false;
    const word = matchWord(current, selection);
    if (!word) return false;
    if (shared) {
      const path = selection;
      selection = [];
      shared.send({ type: 'word', path });
      return true;
    }
    found.add(word.text);
    selection = [];
    save();
    renderProgress();
    return true;
  }

  function tap(index) {
    if (locked.has(index)) return;
    if (selection.at(-1) === index) selection = [];
    else if (!extend(index)) selection = [index];
    if (!finishSelection()) renderSelection();
  }

  function cellIndex(node) {
    const button = node?.closest('.wordsearch-cell');
    return button && grid.contains(button) ? Number(button.dataset.index) : undefined;
  }

  grid.addEventListener('pointerdown', (event) => {
    const index = cellIndex(event.target);
    if (pointer || event.button !== 0 || index === undefined || locked.has(index)) return;
    event.preventDefault();
    pointer = { id: event.pointerId, start: index, dragged: false };
    grid.setPointerCapture(event.pointerId);
    focusCell(index);
    drawInk();
  });

  function movePointer(event) {
    if (pointer?.id !== event.pointerId) return;
    const index = cellIndex(document.elementFromPoint(event.clientX, event.clientY));
    if (index === undefined || (!pointer.dragged && index === pointer.start)) return;
    if (pointer.dragged && index === selection.at(-1)) return;
    if (!pointer.dragged) {
      pointer.dragged = true;
      selection = [pointer.start];
    }
    if (extend(index, true)) focusCell(index);
    renderSelection();
  }

  grid.addEventListener('pointermove', movePointer);
  grid.addEventListener('pointerup', (event) => {
    if (pointer?.id !== event.pointerId) return;
    movePointer(event);
    const { start, dragged } = pointer;
    pointer = undefined;
    if (!dragged) tap(start);
    else if (!finishSelection()) {
      selection = [];
      renderSelection();
    }
  });
  grid.addEventListener('lostpointercapture', (event) => {
    if (pointer?.id !== event.pointerId) return;
    if (pointer.dragged) selection = [];
    pointer = undefined;
    renderSelection();
  });
  grid.addEventListener('click', (event) => {
    const index = cellIndex(event.target);
    if (event.detail === 0 && index !== undefined) tap(index);
  });
  grid.addEventListener('keydown', (event) => {
    const index = cellIndex(event.target);
    if (index === undefined) return;
    if (event.key === 'Escape') {
      selection = [];
      renderSelection();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const row = Math.floor(index / current.size) + move[0];
    const column = index % current.size + move[1];
    if (row >= 0 && row < current.size && column >= 0 && column < current.size) {
      focusCell(row * current.size + column, true);
    }
  });
  clear.addEventListener('click', () => {
    selection = [];
    renderSelection();
    focusCell(cursor, true);
  });
  const inkResize = new ResizeObserver(drawInk);
  inkResize.observe(grid);

  function updateRoom(state) {
    found = new Set(state.found);
    renderProgress();
  }

  function open(path, language, room) {
    Object.assign(progress, readProgress());
    view.lang = language;
    copy = labels[language];
    view.setAttribute('aria-label', copy.title);
    group = puzzles.filter((puzzle) => puzzle.language === language);
    current = group.find((puzzle) => puzzle.id === path);
    shared = room;
    cursor = 0;
    pointer = undefined;
    selection = [];
    $('wordsearch-lobby').hidden = Boolean(current);
    $('wordsearch-game').hidden = !current;
    $('wordsearch-room-actions').hidden = !current;
    const back = $('wordsearch-back');
    $('wordsearch-home').hidden = Boolean(current);
    $('wordsearch-home').querySelector('span').textContent = copy.games;
    back.hidden = !current;
    back.href = puzzleLink(language);
    back.querySelector('span').textContent = copy.back;
    const languages = $('wordsearch-languages');
    languages.setAttribute('aria-label', copy.language);
    for (const link of languages.querySelectorAll('a')) {
      if (link.lang === language) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }

    const title = $('wordsearch-title');
    title.textContent = copy.title;
    title.hidden = Boolean(current);
    if (current) {
      found = shared ? new Set(shared.state.found) : savedWords(current);
      buildGame();
      clear.textContent = copy.clear;
      $('wordsearch-help').textContent = copy.help;
      renderProgress();
    } else {
      $('wordsearch-intro').textContent = copy.intro;
      buildLobby();
    }
    (current ? back : title).focus({ preventScroll: true });
  }

  return { open, updateRoom };
}
