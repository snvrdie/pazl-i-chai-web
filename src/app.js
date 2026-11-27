import { PuzzleBoard } from './board.js?v=tray-return';
import { collectionPicture } from './collection-picture.js';
import { progressLabel } from './jigsaw-progress.js?v=tray-return';
import { loadImage, prepareImage, sample, samples } from './images.js?v=dotted-board';
import { levels, shuffled } from './puzzle.js?v=quiet-gallery';
import { countCompleted, deleteCompleted, finishGame, getActive, getCompleted, getCompletedImages, saveActive } from './storage.js?v=collection-delete';
import { createSudokuView } from './sudoku-view.js?v=shared-rooms';
import { createScanwordsView } from './scanwords-view.js?v=puzzle-layout';
import { createWordsearchView } from './wordsearch-view.js?v=shared-rooms';
import { connectRoom, createRoom, loadRoom, roomsAvailable } from './rooms.js?v=puzzle-layout';
import { jigsawSample } from './room-game.js?v=puzzle-layout';

const $ = (id) => document.getElementById(id);
const fileLimit = 20 * 1024 * 1024;
const uploadTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const libraryDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
const galleryUrls = [];
const sudoku = createSudokuView();
const scanwords = createScanwordsView();
const wordsearch = createWordsearchView();
const sharedViews = { sudoku, scanwords, wordsearch };
const inviteButtons = [...document.querySelectorAll('[data-room-create]')];
const roomCopy = {
  en: {
    invite: 'play together', creating: 'creating room…', unavailable: 'could not create a room. try again.',
    copy: 'copy invite link', copied: 'link copied', link: 'invite link',
    connected: 'playing together', connecting: 'connecting to the room…',
    saving: 'saving moves…', failed: 'a move could not be saved.',
  },
  ru: {
    invite: 'играть вместе', creating: 'создаём комнату…', unavailable: 'не удалось создать комнату. попробуйте ещё раз.',
    copy: 'скопировать ссылку', copied: 'ссылка скопирована', link: 'ссылка для приглашения',
    connected: 'совместная игра', connecting: 'подключаемся к комнате…',
    saving: 'сохраняем ходы…', failed: 'не удалось сохранить ход.',
  },
};
let source = null;
let selectedSample = sample;
let uploadVersion = 0;
let processing = false;
let starting = false;
let active;
let game;
let puzzleBoard;
let routeVersion = 0;
let sourceUrl;
let finishUrl;
let previewRequest;
let deleteId;
let saveQueue = Promise.resolve();
let onlineRooms = false;
let roomCreating = false;
let openRoom;
let roomLanguage = 'en';

function report(id, message = '') {
  const box = $(id);
  box.textContent = message;
  box.hidden = !message;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

function setSource(data) {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  source = data;
  sourceUrl = data ? URL.createObjectURL(data.thumbnail) : undefined;
  $('source-photo').src = sourceUrl ?? selectedSample.url;
  $('reset-photo').hidden = !data;
  $('drop-title').textContent = data ? 'replace photo' : 'add your own photo';
}

function refreshStart() {
  $('start-game').disabled = processing || starting;
  $('start-game').querySelector('span').textContent = starting ? 'preparing your puzzle…' : 'start puzzle';
  $('drop-help').textContent = processing ? 'loading your image…' : 'drag it here or choose a file';
  refreshInvites();
}

async function chooseFile(file) {
  if (!file || starting) return;
  const version = ++uploadVersion;
  processing = true;
  refreshStart();
  report('upload-error');
  try {
    if (!uploadTypes.includes(file.type) && (file.type || !/\.(jpe?g|png|webp|avif|gif)$/i.test(file.name))) {
      throw new Error('choose a JPG, PNG, WebP, AVIF or GIF file.');
    }
    if (file.size > fileLimit) throw new Error('choose a file that is 20 MB or smaller.');
    const filename = file.name;
    const name = filename.replace(/\.[^.]+$/, '').trim() || 'my image';
    const data = await prepareImage(file, filename, name);
    if (version === uploadVersion) setSource(data);
  } catch (error) {
    if (version === uploadVersion) {
      report('upload-error', error instanceof DOMException ? 'this image could not be opened. try a different file.' : error.message);
    }
  } finally {
    if (version === uploadVersion) {
      processing = false;
      refreshStart();
    }
  }
}

function showResume() {
  $('resume-panel').hidden = !active;
  $('home-resume').hidden = !active;
  if (!active) return;
  $('resume-progress').textContent = 'in progress · ' + progressLabel(active, levels[active.level].count);
}

function reportStorageError() {
  report('upload-error', 'browser storage is unavailable. your images and progress may not be saved.');
}

async function restoreActive() {
  try {
    active = await getActive();
    showResume();
  } catch {
    reportStorageError();
  }
}

async function startGame() {
  if (processing || starting) return;
  starting = true;
  refreshStart();
  await activeReady;
  if (active?.placed.length || active?.loose.length) {
    if (!window.confirm('start a new puzzle? this will replace your unfinished puzzle.')) {
      starting = false;
      refreshStart();
      return;
    }
  }
  report('upload-error');
  let storageWarning = '';
  try {
    let data = source;
    if (!data) {
      const response = await fetch(selectedSample.url);
      if (!response.ok) throw new Error('the gallery image could not be loaded.');
      data = await prepareImage(await response.blob(), selectedSample.filename, selectedSample.name);
    }
    const level = document.querySelector('input[name="level"]:checked').value;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const id = crypto.randomUUID?.() ?? [Date.now(), seed].join('-');
    const order = shuffled(Array.from({ length: levels[level].count }, (_, index) => index));
    const next = { ...data, id, level, seed, order, placed: [], loose: [], groups: [] };
    await saveQueue;
    try {
      await saveActive(next, true);
    } catch {
      storageWarning = 'progress could not be saved. check that browser storage is available.';
    }
    active = next;
    game = next;
    showResume();
    location.hash = 'play';
  } catch {
    report('upload-error', 'the puzzle could not be created. try a different image.');
  } finally {
    starting = false;
    refreshStart();
  }
  if (storageWarning) report('game-error', storageWarning);
}

function showLibraryCount(count) {
  $('library-count').hidden = count === 0;
  $('library-count').textContent = String(count);
}

function clearGallery() {
  galleryUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  $('gallery').replaceChildren();
}

function downloadFor(anchor, entry, url) {
  anchor.href = url;
  anchor.download = entry.filename;
}

async function openPreview(entry, getImages, getDownload) {
  const request = Symbol();
  previewRequest = request;
  const photo = $('preview-photo');
  const download = $('preview-download');
  photo.hidden = true;
  photo.removeAttribute('src');
  download.hidden = true;
  report('preview-status', 'preparing picture…');
  $('preview-dialog').showModal();

  const [picture, originalUrl] = await Promise.all([
    collectionPicture(entry, getImages, 1400, true).catch(() => undefined),
    getDownload(),
  ]);
  if (previewRequest !== request) return;
  report('preview-status');
  if (originalUrl) {
    downloadFor(download, entry, originalUrl);
    download.hidden = false;
  }
  if (picture) {
    photo.src = picture;
    photo.alt = entry.name + ', assembled puzzle';
    photo.hidden = false;
    return;
  }
  report('preview-status', 'the saved photo could not be opened.');
}

function confirmPuzzleDeletion(entry) {
  if ($('confirm-puzzle-delete').disabled) return;
  deleteId = entry.id;
  $('delete-puzzle-help').textContent = '“' + entry.name + '” will be permanently removed from your collection.';
  report('delete-puzzle-error');
  $('delete-puzzle-dialog').showModal();
}

async function removePuzzle(event) {
  event.preventDefault();
  const id = deleteId;
  const button = $('confirm-puzzle-delete');
  const cancel = $('cancel-puzzle-delete');
  if (id === undefined || button.disabled) return;
  button.disabled = true;
  cancel.disabled = true;
  report('delete-puzzle-error');
  const version = routeVersion;
  const deletion = saveQueue.then(() => deleteCompleted(id));
  saveQueue = deletion.catch(() => {});
  try {
    await deletion;
    if (game?.id === id) {
      game = undefined;
      if (puzzleBoard?.game.id === id) {
        puzzleBoard.destroy();
        puzzleBoard = undefined;
      }
      if (finishUrl) URL.revokeObjectURL(finishUrl);
      finishUrl = undefined;
    }
    $('delete-puzzle-dialog').close();
    if (version === routeVersion) {
      await renderLibrary(version);
      if (version === routeVersion) $('library-title').focus({ preventScroll: true });
    } else {
      showLibraryCount(await countCompleted());
    }
  } catch {
    if (version === routeVersion) report('delete-puzzle-error', 'the puzzle could not be deleted. try again.');
  } finally {
    button.disabled = false;
    cancel.disabled = false;
  }
}

function galleryCard(entry, index) {
  const card = document.createElement('article');
  card.className = 'gallery-card';
  const figure = document.createElement('button');
  figure.type = 'button';
  figure.className = 'gallery-photo';
  const number = index + 1;
  figure.setAttribute('aria-label', 'preview completed puzzle ' + number);
  const image = document.createElement('img');
  image.alt = '';
  image.hidden = true;
  const placeholder = document.createElement('span');
  placeholder.className = 'gallery-placeholder';
  placeholder.textContent = 'preparing picture…';
  figure.append(image, placeholder);

  const details = document.createElement('div');
  details.className = 'gallery-details';
  const caption = document.createElement('p');
  caption.textContent = levels[entry.level].label + ' · ' + libraryDate.format(entry.completedAt);
  const download = document.createElement('a');
  download.className = 'icon-button';
  download.title = 'download image';
  download.setAttribute('aria-label', 'download original photo for completed puzzle ' + number);
  download.hidden = true;
  download.append(icon('download'));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'icon-button';
  remove.title = 'delete puzzle';
  remove.setAttribute('aria-label', 'delete completed puzzle ' + number);
  remove.setAttribute('aria-haspopup', 'dialog');
  remove.append(icon('trash'));
  remove.addEventListener('click', () => confirmPuzzleDeletion(entry));
  const actions = document.createElement('div');
  actions.className = 'gallery-actions';
  actions.append(download, remove);
  details.append(caption, actions);
  card.append(figure, details);

  let images;
  let downloadReady;
  const getImages = () => images ??= getCompletedImages(entry).catch(() => ({})).finally(() => { images = undefined; });
  const getDownload = () => downloadReady ??= getImages().then(async ({ original }) => {
    if (!original?.size) return;
    const source = entry.original ? new Blob([await original.arrayBuffer()], { type: original.type }) : original;
    if (!card.isConnected || !source.size) return;
    const url = URL.createObjectURL(source);
    galleryUrls.push(url);
    return url;
  }).catch(() => undefined);

  figure.addEventListener('click', () => openPreview(entry, getImages, getDownload));
  void getDownload().then((url) => {
    if (!url || !card.isConnected) return;
    downloadFor(download, entry, url);
    download.hidden = false;
  });
  void collectionPicture(entry, getImages, 660).catch(() => undefined).then((picture) => {
    if (!card.isConnected) return;
    if (picture) {
      image.src = picture;
      image.hidden = false;
      placeholder.hidden = true;
    } else {
      placeholder.textContent = 'photo unavailable';
    }
  });
  return card;
}

async function renderLibrary(version) {
  clearGallery();
  report('library-error');
  $('library-empty').hidden = true;
  $('library-loading').hidden = false;
  try {
    await saveQueue;
    const entries = await getCompleted();
    if (version !== routeVersion) return;
    showLibraryCount(entries.length);
    $('library-empty').hidden = entries.length > 0;
    entries.sort((a, b) => b.completedAt - a.completedAt);
    $('gallery').append(...entries.map(galleryCard));
  } catch {
    if (version === routeVersion) report('library-error', 'the collection could not be opened. check that browser storage is available.');
  } finally {
    if (version === routeVersion) $('library-loading').hidden = true;
  }
}

function showFinish(state, message) {
  $('finish-panel').hidden = false;
  $('finish-message').textContent = message;
  $('retry-finish').hidden = state !== 'error';
  $('finish-panel').querySelector('a[href="#library"]').hidden = state !== 'saved';
  if (finishUrl) URL.revokeObjectURL(finishUrl);
  finishUrl = URL.createObjectURL(game.original);
  downloadFor($('finish-download'), game, finishUrl);
}

function persistCompletion(current) {
  showFinish('saving', 'saving to your collection…');
  saveQueue = saveQueue.then(async () => {
    try {
      await finishGame(current);
      if (game?.id === current.id) {
        game = { ...current, saved: true };
        if (active?.id === current.id) active = undefined;
        report('game-error');
        showResume();
        showFinish('saved', 'saved to your collection.');
      }
      showLibraryCount(await countCompleted());
    } catch {
      if (game?.id === current.id && !game.saved) {
        showFinish('error', 'this puzzle could not be saved. you can still download the image.');
      }
    }
  });
}

function onBoardChange(progress, done) {
  game = { ...game, ...progress, completedAt: done ? Date.now() : undefined };
  if (done) {
    game.puzzleWidth = puzzleBoard.puzzle.width;
    game.puzzleHeight = puzzleBoard.puzzle.height;
  }
  if (active?.id === game.id) active = game;
  showResume();
  const current = game;
  if (done) {
    persistCompletion(current);
    $('finish-title').focus({ preventScroll: true });
    return;
  }
  saveQueue = saveQueue.then(async () => {
    try {
      await saveActive(current);
      if (game?.id === current.id) report('game-error');
    } catch {
      if (game?.id === current.id) report('game-error', 'progress could not be saved in this browser.');
    }
  });
}

async function openGame(current, version, shared) {
  if (puzzleBoard?.game.id === current.id) return;
  const image = await loadImage(current.playable);
  if (version !== routeVersion) return;
  puzzleBoard?.destroy();
  $('finish-panel').hidden = true;
  const level = levels[current.level];
  $('game-level').textContent = level.label + ' · ' + level.count + ' pieces';
  $('game-feedback').textContent = '';
  if (!shared) game = current;
  const onChange = shared ? (_progress, _done, action) => shared.send(action) : onBoardChange;
  puzzleBoard = new PuzzleBoard(current, image, onChange);
  puzzleBoard.resize();
  if (shared) {
    report('game-error');
    showSharedFinish(shared);
  } else if (current.completedAt) {
    if (current.saved) showFinish('saved', 'saved to your collection.');
    else persistCompletion(current);
  }
  $('game-title').focus({ preventScroll: true });
}

function showView(view, language = view === 'scanwords' ? 'ru' : 'en', shared = false) {
  if (view !== 'scanwords') scanwords.closeCode();
  for (const key of ['home', 'sudoku', 'scanwords', 'wordsearch', 'create', 'play', 'library', 'room']) $(key + '-view').hidden = key !== view;
  const footer = $('footer-progress');
  footer.lang = language;
  if (shared) footer.textContent = language === 'ru' ? 'прогресс сохраняется в комнате' : 'progress is saved in this room';
  else footer.textContent = language === 'ru' ? 'прогресс сохраняется в этом браузере' : 'your progress stays in this browser';
  if (view !== 'library') {
    if ($('preview-dialog').open) $('preview-dialog').close();
    if ($('delete-puzzle-dialog').open) $('delete-puzzle-dialog').close();
    clearGallery();
  }
}

function refreshInvites() {
  for (const button of inviteButtons) {
    const jigsaw = button.dataset.roomCreate === 'jigsaw';
    button.hidden = !onlineRooms || Boolean(openRoom);
    button.disabled = roomCreating || (jigsaw && (processing || starting || Boolean(source)));
  }
  $('room-photo-help').hidden = !onlineRooms || !source;
  inviteButtons.find((button) => button.dataset.roomCreate === 'wordsearch').textContent =
    roomCopy[$('wordsearch-view').lang === 'ru' ? 'ru' : 'en'].invite;
}

async function invite(button) {
  if (roomCreating) return;
  const type = button.dataset.roomCreate;
  const isJigsaw = type === 'jigsaw';
  const id = isJigsaw ? selectedSample.filename : location.hash.split('/')[1];
  const language = type === 'scanwords' || (type === 'wordsearch' && id?.startsWith('ru-')) ? 'ru' : 'en';
  const copy = roomCopy[language];
  const config = isJigsaw ? { type, id, level: document.querySelector('input[name="level"]:checked').value } : { type, id };
  const feedback = button.parentNode.querySelector('[role="status"]');
  const version = routeVersion;
  roomCreating = true;
  refreshInvites();
  button.textContent = copy.creating;
  feedback.hidden = true;
  try {
    const room = await createRoom(config);
    if (version === routeVersion) location.hash = 'room/' + room.id;
  } catch {
    if (version === routeVersion) {
      feedback.textContent = copy.unavailable;
      feedback.hidden = false;
    }
  } finally {
    roomCreating = false;
    button.textContent = copy.invite;
    refreshInvites();
  }
}

function showSharedFinish(room) {
  $('finish-panel').hidden = !puzzleBoard.done;
  if (!puzzleBoard.done) return;
  $('finish-message').textContent = 'you finished the puzzle together.';
  $('retry-finish').hidden = true;
  $('finish-panel').querySelector('a[href="#library"]').hidden = true;
  downloadFor($('finish-download'), room.sample, room.sample.url);
}

function closeSharedGame() {
  if (!openRoom) return;
  openRoom.session?.close();
  if (openRoom.sample) {
    puzzleBoard?.destroy();
    puzzleBoard = undefined;
  }
  openRoom = undefined;
  $('room-controls').hidden = true;
  refreshInvites();
}

async function openSharedGame(id, version) {
  showView('room');
  window.scrollTo(0, 0);
  $('room-title').focus({ preventScroll: true });
  $('room-error').textContent = 'opening the room…';
  $('retry-room').hidden = true;
  try {
    if (!/^[a-f0-9]{32}$/.test(id)) throw Object.assign(new Error(), { status: 404 });
    const initial = await loadRoom(id);
    if (version !== routeVersion) return;
    const { type, id: puzzleId } = initial.game;
    const language = type === 'scanwords' || (type === 'wordsearch' && puzzleId.startsWith('ru-')) ? 'ru' : 'en';
    const room = { state: initial.state, send: (action) => room.session?.send(action) };
    openRoom = room;
    if (type === 'jigsaw') {
      room.sample = jigsawSample(initial.game);
      showView('play', language, true);
      const { seed, level } = initial.game;
      await openGame({ ...initial.state, id, seed, level, playable: room.sample.url }, version, room);
      if (version !== routeVersion) return;
    } else {
      showView(type, language, true);
      if (type === 'wordsearch') wordsearch.open(puzzleId, language, room);
      else sharedViews[type].open(puzzleId, room);
    }

    roomLanguage = language;
    $('copy-room-link').textContent = roomCopy[language].copy;
    $('room-link').hidden = true;
    $('room-link').value = location.href;
    $('room-link').setAttribute('aria-label', roomCopy[language].link);
    $(type + '-room-actions').append($('room-controls'));
    $('room-controls').hidden = false;
    refreshInvites();
    room.session = connectRoom(initial, (state) => {
      room.state = state;
      if (room.sample) {
        puzzleBoard.setProgress(state);
        showSharedFinish(room);
      } else sharedViews[type].updateRoom(state);
    }, (status) => {
      const message = roomCopy[language][status];
      if ($('room-connection').textContent !== message) $('room-connection').textContent = message;
    });
  } catch (error) {
    if (version !== routeVersion) return;
    closeSharedGame();
    showView('room');
    const missing = error.status === 404;
    $('room-error').textContent = missing ? 'this room could not be found. check the invite link.' : 'could not open the room. try again.';
    $('retry-room').hidden = missing;
    $('room-title').focus({ preventScroll: true });
  }
}

async function route() {
  const version = ++routeVersion;
  const hash = location.hash.slice(1);
  closeSharedGame();
  for (const button of inviteButtons) button.parentNode.querySelector('[role="status"]').hidden = true;
  if (hash === 'room' || hash.startsWith('room/')) {
    await openSharedGame(hash.slice('room/'.length), version);
    return;
  }
  if (hash === 'scanwords' || hash.startsWith('scanwords/')) {
    showView('scanwords');
    window.scrollTo(0, 0);
    scanwords.open(hash.slice('scanwords/'.length));
    return;
  }
  if (hash === 'sudoku' || hash.startsWith('sudoku/')) {
    showView('sudoku');
    window.scrollTo(0, 0);
    sudoku.open(hash.slice('sudoku/'.length));
    return;
  }
  if (hash === 'wordsearch' || hash.startsWith('wordsearch/')) {
    const path = hash.slice('wordsearch/'.length);
    const language = path === 'ru' || path.startsWith('ru-') ? 'ru' : 'en';
    showView('wordsearch', language);
    window.scrollTo(0, 0);
    wordsearch.open(path, language);
    refreshInvites();
    return;
  }
  if (hash === 'library') {
    showView('library');
    window.scrollTo(0, 0);
    $('library-title').focus({ preventScroll: true });
    await renderLibrary(version);
    return;
  }
  if (hash === 'play' && !game && !active) {
    await activeReady;
    if (version !== routeVersion) return;
  }
  if (hash === 'play' && (game || active)) {
    showView('play');
    window.scrollTo(0, 0);
    try {
      await openGame(game ?? active, version);
      if (version === routeVersion) puzzleBoard?.resize();
    } catch {
      if (version === routeVersion) report('game-error', 'the saved puzzle could not be opened.');
    }
    return;
  }
  if (hash === 'games') {
    showView('home');
    focusSection('games', 'games-title');
  } else if (hash === 'setup') {
    showView('create');
    focusSection('setup', 'setup-title');
  } else if (hash === 'puzzles') {
    showView('create');
    focusSection('puzzles', 'catalog-title');
  } else {
    const view = hash === 'create' || hash === 'play' ? 'create' : 'home';
    showView(view);
    window.scrollTo(0, 0);
    if (hash) $(view === 'home' ? 'home-title' : 'hero-title').focus({ preventScroll: true });
  }
}

function focusSection(section, heading) {
  $(section).scrollIntoView({ block: 'start' });
  $(heading).focus({ preventScroll: true });
}

function clearUpload() {
  uploadVersion += 1;
  processing = false;
  setSource(null);
  report('upload-error');
  refreshStart();
}

function chooseSample(event, entry) {
  if (starting) {
    event.preventDefault();
    return;
  }
  selectedSample = entry;
  clearUpload();
  if (location.hash === '#setup') {
    event.preventDefault();
    focusSection('setup', 'setup-title');
  }
}

function renderCatalog() {
  const template = $('catalog-card');
  const cards = samples.map((entry, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const image = card.querySelector('img');
    image.width = entry.width;
    image.height = entry.height;
    image.src = entry.url;
    const link = card.querySelector('a');
    link.setAttribute('aria-label', 'set up gallery puzzle ' + (index + 1));
    link.addEventListener('click', (event) => chooseSample(event, entry));
    return card;
  });
  template.after(...cards);
  $('catalog-count').textContent = cards.length + (cards.length === 1 ? ' image' : ' images');
}

function renderLevels() {
  const template = $('level-option');
  const options = Object.entries(levels).map(([key, { label, count }]) => {
    const option = template.content.firstElementChild.cloneNode(true);
    const radio = option.querySelector('input');
    radio.value = key;
    radio.defaultChecked = key === 'easy';
    option.querySelector('.level-label').textContent = label;
    option.querySelector('small').textContent = count + ' pieces';
    return option;
  });
  $('level-options').append(...options);
}

for (const id of ['hero-upload', 'catalog-upload', 'drop-zone']) {
  $(id).addEventListener('click', () => $('file').click());
}
$('file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (location.hash === '#setup') focusSection('setup', 'setup-title');
  else location.hash = 'setup';
  chooseFile(file);
});
$('reset-photo').addEventListener('click', () => {
  if (starting) return;
  clearUpload();
  $('drop-zone').focus();
});

const dropZone = $('drop-zone');
dropZone.addEventListener('dragover', (event) => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('is-dragover');
});
dropZone.addEventListener('dragleave', (event) => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragover');
});
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('is-dragover');
  chooseFile(event.dataTransfer.files[0]);
});
$('start-game').addEventListener('click', startGame);
for (const button of inviteButtons) button.addEventListener('click', () => invite(button));
$('retry-room').addEventListener('click', route);
$('copy-room-link').addEventListener('click', async () => {
  const link = $('room-link');
  try {
    await navigator.clipboard.writeText(link.value);
    $('copy-room-link').textContent = roomCopy[roomLanguage].copied;
  } catch {
    link.hidden = false;
    link.select();
  }
});
$('retry-finish').addEventListener('click', () => persistCompletion(game));
$('close-preview').addEventListener('click', () => $('preview-dialog').close());
$('preview-dialog').addEventListener('close', () => {
  if ($('preview-dialog').open) return;
  previewRequest = undefined;
  $('preview-photo').removeAttribute('src');
});
$('delete-puzzle-form').addEventListener('submit', removePuzzle);
$('cancel-puzzle-delete').addEventListener('click', () => $('delete-puzzle-dialog').close());
$('delete-puzzle-dialog').addEventListener('cancel', (event) => {
  if ($('confirm-puzzle-delete').disabled) event.preventDefault();
});
renderCatalog();
renderLevels();
const activeReady = restoreActive();
countCompleted().then(showLibraryCount, reportStorageError);
window.addEventListener('hashchange', route);
roomsAvailable().then((available) => {
  onlineRooms = available;
  refreshInvites();
});
route();
