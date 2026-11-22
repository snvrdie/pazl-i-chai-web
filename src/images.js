export const sample = {
  name: 'a quiet afternoon',
  filename: 'quiet-afternoon.jpg',
  url: './assets/quiet-afternoon.jpg',
  width: 736,
  height: 965,
};

export const samples = [
  sample,
  {
    name: 'coffee and pages',
    filename: 'coffee-and-pages.jpg',
    url: './assets/coffee-and-pages.jpg',
    width: 736,
    height: 981,
  },
  {
    name: 'the road to the sea',
    filename: 'road-to-the-sea.webp',
    url: './assets/road-to-the-sea.webp',
    width: 1080,
    height: 1080,
  },
];

export function loadImage(source) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image).finally(() => {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  });
}

function raster(image, maxSide) {
  const scale = Math.min(maxSide / Math.max(image.width, image.height), 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('this image could not be prepared'));
    }, 'image/png');
  });
}

export async function prepareImage(original, filename, name) {
  const image = await loadImage(original);
  const ratio = Math.max(image.width, image.height) / Math.min(image.width, image.height);
  if (ratio > 8 || Math.min(image.width, image.height) < 12) {
    throw new Error('use an image that is at least 12 pixels on each side, with an aspect ratio no wider or taller than 8:1.');
  }
  const [playable, thumbnail] = await Promise.all([raster(image, 1800), raster(image, 400)]);
  return { name, filename, original, playable, thumbnail };
}
