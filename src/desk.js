export function fitPuzzle(puzzle, width, height) {
  const margin = Math.min(width, height) * .08;
  return Math.min((width - margin * 2) / puzzle.width, (height - margin * 2) / puzzle.height);
}

export function constrainPan(puzzle, { width, height, scale }, positions, pan) {
  let left = 0;
  let top = 0;
  let right = puzzle.width;
  let bottom = puzzle.height;
  for (const { x, y } of positions.values()) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + puzzle.cellWidth);
    bottom = Math.max(bottom, y + puzzle.cellHeight);
  }
  const reachX = width / 2 - Math.min(64, width * .18);
  const reachY = height / 2 - Math.min(64, height * .18);
  return {
    x: Math.max((puzzle.width / 2 - right) * scale - reachX, Math.min(pan.x, (puzzle.width / 2 - left) * scale + reachX)),
    y: Math.max((puzzle.height / 2 - bottom) * scale - reachY, Math.min(pan.y, (puzzle.height / 2 - top) * scale + reachY)),
  };
}
