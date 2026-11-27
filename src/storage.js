let connection;

function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('pazl-i-chai', 2);
    request.onupgradeneeded = ({ oldVersion }) => {
      if (oldVersion < 1) {
        request.result.createObjectStore('active');
        request.result.createObjectStore('completed', { keyPath: 'id' });
      }
      request.result.createObjectStore('images', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}

async function read(store, query) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const objectStore = db.transaction(store, 'readonly').objectStore(store);
    const request = query(objectStore);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(stores, change) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage write aborted'));
    change(transaction);
  });
}

function separateImages({ original, playable, thumbnail, ...progress }) {
  return { progress, sources: { original, playable, thumbnail } };
}

async function packImage(blob) {
  if (!blob) return;
  const bytes = await blob.arrayBuffer();
  if (!bytes.byteLength) throw new Error('the photo is empty');
  return { bytes, type: blob.type };
}

async function packImages(id, { original, playable, thumbnail }, tolerateMissing = false) {
  const pack = (blob) => tolerateMissing ? packImage(blob).catch(() => undefined) : packImage(blob);
  const [originalImage, playableImage, thumbnailImage] = await Promise.all([pack(original), pack(playable), pack(thumbnail)]);
  return { id, original: originalImage, playable: playableImage, thumbnail: thumbnailImage };
}

function imageBlob(image) {
  return image?.bytes ? new Blob([image.bytes], { type: image.type }) : image;
}

async function readActive() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['active', 'images'], 'readonly');
    transaction.onabort = () => reject(transaction.error ?? new Error('Storage read aborted'));
    const request = transaction.objectStore('active').get('current');
    request.onsuccess = () => {
      const record = request.result;
      if (!record?.hasImages) {
        resolve({ record });
        return;
      }
      const picture = transaction.objectStore('images').get(record.id);
      picture.onsuccess = () => resolve({ record, images: picture.result });
    };
  });
}

export async function getActive() {
  const { record, images } = await readActive();
  if (!record) return;
  if (record.hasImages) {
    if (!images) return record;
    return { ...record, original: imageBlob(images.original), playable: imageBlob(images.playable), thumbnail: imageBlob(images.thumbnail) };
  }
  try {
    // Copy the old files before any progress write can release their original backing files.
    const packed = await packImages(record.id, separateImages(record).sources);
    await write(['active', 'images'], (transaction) => {
      const active = transaction.objectStore('active');
      const current = active.get('current');
      current.onsuccess = () => {
        if (current.result?.id !== record.id || current.result.hasImages) return;
        transaction.objectStore('images').put(packed);
        active.put({ ...separateImages(current.result).progress, hasImages: true }, 'current');
      };
    });
    return { ...record, original: imageBlob(packed.original), playable: imageBlob(packed.playable), thumbnail: imageBlob(packed.thumbnail) };
  } catch {
    return record;
  }
}
export async function getCompleted() {
  const entries = await read('completed', (store) => store.getAll());
  return entries.map((entry) => ({ ...entry, thumbnail: imageBlob(entry.thumbnail) }));
}

export async function getCompletedImages(entry) {
  if (entry.original) return { original: entry.original };
  const images = await read('images', (store) => store.get(entry.id));
  return { original: imageBlob(images?.original), playable: imageBlob(images?.playable) };
}

export const countCompleted = () => read('completed', (store) => store.count());

export function deleteCompleted(id) {
  return write(['completed', 'images'], (transaction) => {
    transaction.objectStore('completed').delete(id);
    transaction.objectStore('images').delete(id);
  });
}

export async function saveActive(game, isNew = false) {
  const { progress, sources } = separateImages(game);
  if (isNew) {
    const images = await packImages(game.id, sources);
    return write(['active', 'images'], (transaction) => {
      const active = transaction.objectStore('active');
      const files = transaction.objectStore('images');
      const previous = active.get('current');
      previous.onsuccess = () => {
        if (previous.result?.hasImages && previous.result.id !== game.id) files.delete(previous.result.id);
        files.put(images);
        active.put({ ...progress, hasImages: true }, 'current');
      };
    });
  }
  return write(['active'], (transaction) => {
    const active = transaction.objectStore('active');
    const current = active.get('current');
    current.onsuccess = () => {
      if (current.result?.id === game.id) active.put({ ...current.result, ...progress }, 'current');
    };
  });
}

export async function finishGame(game) {
  const { id, name, filename, level, seed, puzzleWidth, puzzleHeight, completedAt } = game;
  const saved = await read('images', (store) => store.get(id));
  const { thumbnail, ...images } = saved ?? await packImages(id, separateImages(game).sources, true);
  if (!thumbnail && !images.playable && !images.original) throw new Error('the puzzle photo could not be saved');
  return write(['active', 'completed', 'images'], (transaction) => {
    transaction.objectStore('images').put(images);
    transaction.objectStore('completed').put({
      id, name, filename, level, seed, puzzleWidth, puzzleHeight, completedAt, thumbnail,
    });
    const active = transaction.objectStore('active');
    const current = active.get('current');
    current.onsuccess = () => {
      if (current.result?.id === game.id) active.delete('current');
    };
  });
}
