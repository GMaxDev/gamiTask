import { type GridPos } from "./IsoEngine";

interface Node {
  col: number;
  row: number;
  g: number; // cost from start
  h: number; // heuristic to goal
  f: number;
  parent: Node | null;
}

function heuristic(a: GridPos, b: GridPos): number {
  // Manhattan distance
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

const NEIGHBORS = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
  // Diagonals
  { dc: -1, dr: -1 },
  { dc: 1, dr: -1 },
  { dc: -1, dr: 1 },
  { dc: 1, dr: 1 },
];

/**
 * A* pathfinding on an isometric grid.
 * Returns an array of GridPos steps (excluding start, including end).
 */
export function findPath(
  start: GridPos,
  end: GridPos,
  cols: number,
  rows: number,
  isBlocked: (col: number, row: number) => boolean,
): GridPos[] {
  if (isBlocked(end.col, end.row)) return [];

  const key = (col: number, row: number) => `${col},${row}`;

  const open: Map<string, Node> = new Map();
  const closed: Set<string> = new Set();

  const startNode: Node = {
    col: start.col,
    row: start.row,
    g: 0,
    h: heuristic(start, end),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.h;
  open.set(key(start.col, start.row), startNode);

  while (open.size > 0) {
    // Get node with lowest f
    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.col === end.col && current.row === end.row) {
      // Reconstruct path
      const path: GridPos[] = [];
      let n: Node | null = current;
      while (n && (n.col !== start.col || n.row !== start.row)) {
        path.unshift({ col: n.col, row: n.row });
        n = n.parent;
      }
      return path;
    }

    open.delete(key(current.col, current.row));
    closed.add(key(current.col, current.row));

    for (const { dc, dr } of NEIGHBORS) {
      const nc = current.col + dc;
      const nr = current.row + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (isBlocked(nc, nr)) continue;
      if (closed.has(key(nc, nr))) continue;

      const isDiagonal = dc !== 0 && dr !== 0;
      const g = current.g + (isDiagonal ? 1.414 : 1);
      const h = heuristic({ col: nc, row: nr }, end);
      const f = g + h;

      const existing = open.get(key(nc, nr));
      if (existing && existing.g <= g) continue;

      open.set(key(nc, nr), { col: nc, row: nr, g, h, f, parent: current });
    }
  }

  return []; // No path found
}
