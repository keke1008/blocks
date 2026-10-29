// Piece definitions and SRS (Super Rotation System) kick data.
// Coordinates are y-down: x grows to the right, y grows downward.

export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export type Rotation = 0 | 1 | 2 | 3; // 0 = spawn, 1 = R (CW), 2 = 180, 3 = L (CCW)
export type Cell = readonly [x: number, y: number];

export const PIECE_TYPES: readonly PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

interface BaseShape {
  size: number; // bounding box size used for rotation
  cells: Cell[]; // cells in spawn orientation
}

const BASE: Record<PieceType, BaseShape> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
  O: { size: 3, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
};

function rotateCW(cells: Cell[], size: number): Cell[] {
  return cells.map(([x, y]) => [size - 1 - y, x] as const);
}

function buildRotations(type: PieceType): Cell[][] {
  const { size, cells } = BASE[type];
  // The O piece does not change shape (and never kicks) under SRS.
  if (type === 'O') return [cells, cells, cells, cells];
  const out: Cell[][] = [cells];
  for (let i = 1; i < 4; i++) out.push(rotateCW(out[i - 1], size));
  return out;
}

export const SHAPES: Record<PieceType, Cell[][]> = Object.fromEntries(
  PIECE_TYPES.map((t) => [t, buildRotations(t)]),
) as Record<PieceType, Cell[][]>;

export function pieceCells(type: PieceType, rot: Rotation): Cell[] {
  return SHAPES[type][rot];
}

export function boxSize(type: PieceType): number {
  return BASE[type].size;
}

// Kick tables as published for SRS, written y-up (positive y = up) and
// converted to y-down below.
type KickKey = `${Rotation}${Rotation}`;
const JLSTZ_KICKS_UP: Record<string, Cell[]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS_UP: Record<string, Cell[]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

function toYDown(table: Record<string, Cell[]>): Record<string, Cell[]> {
  const out: Record<string, Cell[]> = {};
  for (const [k, kicks] of Object.entries(table)) {
    out[k] = kicks.map(([x, y]) => [x, y === 0 ? 0 : -y] as const);
  }
  return out;
}

const JLSTZ_KICKS = toYDown(JLSTZ_KICKS_UP);
const I_KICKS = toYDown(I_KICKS_UP);
const NO_KICKS: Cell[] = [[0, 0]];

/** Kick offsets (y-down) to try, in order, when rotating `from` -> `to`. */
export function getKicks(type: PieceType, from: Rotation, to: Rotation): Cell[] {
  if (type === 'O') return NO_KICKS;
  const key: KickKey = `${from}${to}`;
  return (type === 'I' ? I_KICKS : JLSTZ_KICKS)[key];
}

/** Standard guideline colors. */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#31c7ef',
  J: '#5a65ad',
  L: '#ef7921',
  O: '#f7d308',
  S: '#42b642',
  T: '#ad4d9c',
  Z: '#ef2029',
};
