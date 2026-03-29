// Isometric engine utilities
// Tile dimensions (2:1 ratio standard for isometric)
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export interface GridPos {
  col: number;
  row: number;
}

export interface ScreenPos {
  x: number;
  y: number;
}

/**
 * Convert grid (col, row) to screen (x, y) coordinates.
 * Origin is the top of the diamond grid.
 */
export function gridToScreen(
  col: number,
  row: number,
  offsetX = 0,
  offsetY = 0,
): ScreenPos {
  return {
    x: (col - row) * (TILE_WIDTH / 2) + offsetX,
    y: (col + row) * (TILE_HEIGHT / 2) + offsetY,
  };
}

/**
 * Convert screen (x, y) to the nearest grid (col, row).
 */
export function screenToGrid(
  x: number,
  y: number,
  offsetX = 0,
  offsetY = 0,
): GridPos {
  const sx = x - offsetX;
  const sy = y - offsetY;
  const col = Math.round((sx / (TILE_WIDTH / 2) + sy / (TILE_HEIGHT / 2)) / 2);
  const row = Math.round((sy / (TILE_HEIGHT / 2) - sx / (TILE_WIDTH / 2)) / 2);
  return { col, row };
}

/**
 * Rendering depth/z-order for isometric tiles and sprites.
 * Higher col+row = drawn later (in front).
 */
export function isoDepth(col: number, row: number): number {
  return col + row;
}
