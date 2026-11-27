function penPath(positions, size, cell) {
  const points = positions.map((index) => ({
    x: (index % size + 0.5 + 0.018 * Math.sin(index * 1.87)) * cell,
    y: (Math.floor(index / size) + 0.5 + 0.023 * Math.sin(index * 2.73)) * cell,
  }));
  const first = points[0];
  const path = new Path2D();
  if (points.length === 1) {
    path.moveTo(first.x - cell * 0.045, first.y + cell * 0.015);
    path.lineTo(first.x + cell * 0.045, first.y - cell * 0.015);
    return path;
  }

  path.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const vertical = Math.abs(positions[index] - positions[index - 1]) === size;
    const sway = Math.sin(Math.min(positions[index], positions[index - 1]) * 2.19 + 1) * cell * 0.08;
    path.quadraticCurveTo(
      (from.x + to.x) / 2 + (vertical ? sway : 0),
      (from.y + to.y) / 2 + (vertical ? 0 : sway),
      to.x,
      to.y,
    );
  }
  return path;
}

export function drawWordsearchInk(canvas, size, foundPaths, selection) {
  const width = canvas.clientWidth;
  if (!width) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const pixels = Math.round(width * (window.devicePixelRatio || 1));
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const scale = pixels / width;
  const cell = width / size;
  const stroke = Math.max(1.1, Math.min(cell * 0.035, 1.95));
  const found = foundPaths.map((path) => penPath(path, size, cell));
  const active = selection.length ? penPath(selection, size, cell) : null;

  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, width);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // Paint the broad pen paths, then lift their centers to leave the letterforms clear.
  context.globalCompositeOperation = 'source-over';
  context.lineWidth = cell * 0.74;
  context.strokeStyle = '#515868';
  for (const path of found) context.stroke(path);
  if (active) {
    context.strokeStyle = '#2b3549';
    context.stroke(active);
  }
  context.globalCompositeOperation = 'destination-out';
  context.lineWidth -= stroke * 2;
  context.strokeStyle = '#000';
  for (const path of found) context.stroke(path);
  if (active) context.stroke(active);
}
