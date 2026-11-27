import { loadImage } from './images.js?v=dotted-board';
import { createPuzzle, piecePath } from './puzzle.js?v=quiet-gallery';

async function decodeSavedPhoto(blob) {
  if (!blob?.size) return;
  try {
    return await loadImage(blob);
  } catch {
    // An old IndexedDB Blob can be readable even when WebKit cannot load its URL.
    try {
      const bytes = await blob.arrayBuffer();
      if (bytes.byteLength) return await loadImage(new Blob([bytes], { type: blob.type }));
    } catch {
      return;
    }
  }
}

export async function collectionPicture(entry, getImages, maxSide, fullSize = false) {
  let image;
  if (fullSize) {
    const { playable, original } = await getImages();
    image = await decodeSavedPhoto(playable) ?? await decodeSavedPhoto(original) ?? await decodeSavedPhoto(entry.thumbnail);
  } else {
    image = await decodeSavedPhoto(entry.thumbnail);
    if (!image) {
      const { playable, original } = await getImages();
      image = await decodeSavedPhoto(playable) ?? await decodeSavedPhoto(original);
    }
  }
  if (!image) return;

  const { naturalWidth, naturalHeight } = image;
  const { level, seed = 0, puzzleWidth = naturalWidth, puzzleHeight = naturalHeight } = entry;
  const puzzle = createPuzzle(puzzleWidth, puzzleHeight, level, seed);
  const canvas = document.createElement('canvas');
  const scale = maxSide / Math.max(puzzle.width, puzzle.height);
  canvas.width = Math.max(1, Math.round(puzzle.width * scale));
  canvas.height = Math.max(1, Math.round(puzzle.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const seams = new Path2D();
  for (const piece of puzzle.pieces) {
    const transform = new DOMMatrix([scale, 0, 0, scale, piece.x * scale, piece.y * scale]);
    seams.addPath(piecePath(puzzle, piece), transform);
  }
  const lineWidth = maxSide > 800 ? 1.6 : 1.1;
  context.lineJoin = 'round';
  context.lineWidth = lineWidth + 1.2;
  context.strokeStyle = '#fffaf36b';
  context.stroke(seams);
  context.lineWidth = lineWidth;
  context.strokeStyle = '#25232bb3';
  context.stroke(seams);
  return canvas.toDataURL('image/png');
}
