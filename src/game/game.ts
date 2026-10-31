import { Bag, type Rng } from './bag';
import { getKicks, pieceCells, type Cell, type PieceType, type Rotation } from './pieces';
import { MARATHON, gravityMs, type Mode } from './modes';
import { scoreClear, type TSpin } from './scoring';

export { gravityMs } from './modes';

export const WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
/** Rows above the visible field where pieces spawn. */
export const BUFFER_HEIGHT = 20;
export const HEIGHT = VISIBLE_HEIGHT + BUFFER_HEIGHT;

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const QUEUE_SIZE = 6;
/** Chance that a rising garbage row moves its hole to another column. */
export const GARBAGE_HOLE_CHANGE = 0.3;

/** 'G' is a garbage block (Rising mode). */
export type BoardCell = PieceType | 'G' | null;
export type Board = BoardCell[][];
export type ReadonlyBoard = readonly (readonly BoardCell[])[];

export interface ActivePiece {
  type: PieceType;
  rot: Rotation;
  x: number;
  y: number;
}

export type GameStatus = 'playing' | 'gameover' | 'complete';

export interface ClearEvent {
  labels: string[];
  points: number;
  /** Timestamp (game time, ms) the event happened. */
  at: number;
}

export interface GameOptions {
  /** Mode rules. Defaults to Marathon. */
  mode?: Mode;
  rng?: Rng;
  /** Picks garbage hole columns (Rising). Defaults to Math.random. */
  garbageRng?: Rng;
  /** Soft drop gravity multiplier. Infinity drops to the floor instantly. */
  softDropFactor?: number;
  /** Starting board (copied). For tests and puzzles. */
  board?: ReadonlyBoard;
  /** Place this piece instead of spawning from the queue. For tests and puzzles. */
  piece?: ActivePiece;
}

/**
 * Builds a board from text rows aligned to the bottom of the field:
 * '.' is empty, any other character is a filled cell.
 */
export function boardFromRows(rows: readonly string[]): Board {
  const board = emptyBoard();
  rows.forEach((row, i) => {
    const y = HEIGHT - rows.length + i;
    [...row].forEach((ch, x) => {
      if (ch !== '.') board[y][x] = 'Z';
    });
  });
  return board;
}

export function emptyBoard(): Board {
  return Array.from({ length: HEIGHT }, () => Array<BoardCell>(WIDTH).fill(null));
}

export class Game {
  readonly mode: Mode;
  private _board: Board;
  private _active: ActivePiece | null = null;
  /** Increments every time a new piece enters play (spawn, hold swap or fixture). */
  pieceCount = 0;
  hold: PieceType | null = null;
  holdUsed = false;
  queue: PieceType[] = [];

  score = 0;
  lines = 0;
  level = 1;
  combo = -1;
  b2b = false;
  status: GameStatus = 'playing';
  lastClear: ClearEvent | null = null;
  time = 0;
  /** Garbage rows that have risen so far (Rising). */
  rises = 0;
  /** Times the board was cleared after a top out (Zen). */
  boardResets = 0;

  private _softDrop = false;
  private softDropFactor: number;

  private bag: Bag;
  /** Progress toward the next gravity step, in rows (kept speed-independent). */
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastMoveRotation = false;
  private lastKickIndex = 0;
  private riseTimer = 0;
  /** Column of the garbage hole; picked on the first rise. */
  private holeX: number | null = null;
  private garbageRng: Rng;

  constructor(options: GameOptions = {}) {
    this.mode = options.mode ?? MARATHON;
    this.level = this.mode.level(0);
    this.garbageRng = options.garbageRng ?? Math.random;
    this.bag = new Bag(options.rng);
    this.softDropFactor = options.softDropFactor ?? 20;
    this._board = options.board ? options.board.map((row) => [...row]) : emptyBoard();
    while (this.queue.length < QUEUE_SIZE) this.queue.push(this.bag.next());
    if (options.piece) {
      this._active = { ...options.piece };
      this.lowestY = options.piece.y;
      this.pieceCount++;
    } else {
      this.spawn(this.takeNext());
    }
  }

  get board(): ReadonlyBoard {
    return this._board;
  }

  get active(): Readonly<ActivePiece> | null {
    return this._active;
  }

  get softDropping(): boolean {
    return this._softDrop;
  }

  /** Progress toward the next garbage row, 0..1; null when the mode has none. */
  get riseProgress(): number | null {
    const interval = this.mode.riseInterval?.(this.level);
    return interval ? Math.min(1, this.riseTimer / interval) : null;
  }

  /** Milliseconds per row from gravity alone (Infinity when the mode has none). */
  gravityInterval(): number {
    return this.mode.gravity(this.level);
  }

  /** Milliseconds per row while soft dropping (0 = instant). */
  softDropInterval(): number {
    const base = this.gravityInterval();
    // Without gravity, soft drop runs at level 1 speed times the factor.
    return (Number.isFinite(base) ? base : gravityMs(1)) / this.softDropFactor;
  }

  // ---------------------------------------------------------------- input

  setSoftDrop(on: boolean): void {
    this._softDrop = on;
  }

  /** Soft drop gravity multiplier. Infinity drops to the floor instantly. */
  setSoftDropFactor(factor: number): void {
    this.softDropFactor = factor;
  }

  // ---------------------------------------------------------------- queries

  collides(type: PieceType, rot: Rotation, x: number, y: number): boolean {
    for (const [cx, cy] of pieceCells(type, rot)) {
      const bx = x + cx;
      const by = y + cy;
      if (bx < 0 || bx >= WIDTH || by < 0 || by >= HEIGHT) return true;
      if (this._board[by][bx] !== null) return true;
    }
    return false;
  }

  /** Board cells occupied by the active piece. */
  activeCells(): Cell[] {
    const p = this._active;
    if (!p) return [];
    return pieceCells(p.type, p.rot).map(([cx, cy]) => [p.x + cx, p.y + cy] as const);
  }

  /** y position where the active piece would land. */
  ghostY(): number {
    const p = this._active;
    if (!p) return 0;
    let y = p.y;
    while (!this.collides(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }

  isGrounded(): boolean {
    const p = this._active;
    return !!p && this.collides(p.type, p.rot, p.x, p.y + 1);
  }

  // ---------------------------------------------------------------- actions

  moveLeft(): boolean {
    return this.shift(-1);
  }

  moveRight(): boolean {
    return this.shift(1);
  }

  /** Rotate clockwise (dir = 1) or counter-clockwise (dir = -1) using SRS kicks. */
  rotate(dir: 1 | -1): boolean {
    const p = this._active;
    if (!p || this.status !== 'playing') return false;
    const to = (((p.rot + dir) % 4) + 4) % 4 as Rotation;
    const kicks = getKicks(p.type, p.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (!this.collides(p.type, to, p.x + dx, p.y + dy)) {
        p.rot = to;
        p.x += dx;
        p.y += dy;
        this.lastMoveRotation = true;
        this.lastKickIndex = i;
        this.afterMove();
        return true;
      }
    }
    return false;
  }

  hardDrop(): void {
    const p = this._active;
    if (!p || this.status !== 'playing') return;
    const y = this.ghostY();
    if (y > p.y) {
      this.score += (y - p.y) * 2;
      p.y = y;
      this.lastMoveRotation = false;
    }
    this.lock();
  }

  holdPiece(): boolean {
    const p = this._active;
    if (!p || this.holdUsed || this.status !== 'playing') return false;
    const next = this.hold ?? this.takeNext();
    this.hold = p.type;
    this.holdUsed = true;
    this.spawn(next);
    return true;
  }

  /** Advance the game by `dt` milliseconds (gravity, soft drop and lock delay). */
  update(dt: number): void {
    if (this.status !== 'playing' || !this._active) return;
    this.time += dt;

    const rise = this.mode.riseInterval;
    if (rise) {
      this.riseTimer += dt;
      const interval = rise(this.level);
      while (this.riseTimer >= interval) {
        this.riseTimer -= interval;
        this.rise();
        if (this.status !== 'playing') return;
      }
    }

    const interval = this.softDropping ? this.softDropInterval() : this.gravityInterval();

    if (this.isGrounded()) {
      this.gravityAcc = 0;
    } else if (interval <= 0) {
      this.dropRows(Infinity, true);
    } else {
      // Tracked in rows rather than ms so switching soft drop on mid-fall
      // does not cash in the time already spent at normal speed.
      this.gravityAcc += dt / interval;
      const rows = Math.floor(this.gravityAcc);
      if (rows > 0) {
        this.gravityAcc -= rows;
        this.dropRows(rows, this.softDropping);
      }
    }

    if (this.isGrounded()) {
      if (this.lockResets >= MAX_LOCK_RESETS) {
        this.lock();
        return;
      }
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY_MS) this.lock();
    }
  }

  // ---------------------------------------------------------------- internals

  private shift(dx: number): boolean {
    const p = this._active;
    if (!p || this.status !== 'playing') return false;
    if (this.collides(p.type, p.rot, p.x + dx, p.y)) return false;
    p.x += dx;
    this.lastMoveRotation = false;
    this.afterMove();
    return true;
  }

  private dropRows(rows: number, soft: boolean): void {
    const p = this._active!;
    let moved = 0;
    while (moved < rows && !this.collides(p.type, p.rot, p.x, p.y + 1)) {
      p.y++;
      moved++;
    }
    if (moved > 0) {
      if (soft) this.score += moved;
      this.lastMoveRotation = false;
      this.onDescend();
    }
  }

  /** Lock delay reset after a successful move or rotation. */
  private afterMove(): void {
    this.onDescend();
    if (this.lockTimer > 0 || this.isGrounded()) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }
  }

  /** Reaching a new lowest row refreshes the move-reset counter. */
  private onDescend(): void {
    const p = this._active!;
    if (p.y > this.lowestY) {
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
  }

  private takeNext(): PieceType {
    const next = this.queue.shift()!;
    this.queue.push(this.bag.next());
    return next;
  }

  private spawn(type: PieceType): void {
    // JLSTZ/O occupy rows 18-19 of the buffer; I occupies row 19.
    const x = 3;
    const y = type === 'I' ? BUFFER_HEIGHT - 3 : BUFFER_HEIGHT - 2;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastMoveRotation = false;
    this.lastKickIndex = 0;
    this._active = { type, rot: 0, x, y };
    // Block out: the game ends, or (Zen) the board is cleared and the spawn goes ahead.
    if (this.collides(type, 0, x, y) && !this.topOut()) return;
    this.pieceCount++;
    // Guideline: drop one row immediately if nothing is in the way.
    if (!this.collides(type, 0, x, y + 1)) this._active.y++;
    this.lowestY = this._active.y;
  }

  /** 3-corner T-spin detection. Must be called before the piece is merged. */
  detectTSpin(): TSpin {
    const p = this._active;
    if (!p || p.type !== 'T' || !this.lastMoveRotation) return 'none';
    const corners: Cell[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const filled = corners.map(([cx, cy]) => this.isBlocked(p.x + cx, p.y + cy));
    const count = filled.filter(Boolean).length;
    if (count < 3) return 'none';
    // Front corners are the two on the side the T points to.
    const front = [filled[p.rot], filled[(p.rot + 1) % 4]];
    if (front[0] && front[1]) return 'full';
    // A mini upgraded by the last (fifth) kick test counts as a full T-spin.
    if (this.lastKickIndex === 4) return 'full';
    return 'mini';
  }

  private isBlocked(x: number, y: number): boolean {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return true;
    return this._board[y][x] !== null;
  }

  private lock(): void {
    const p = this._active;
    if (!p) return;
    const tspin = this.detectTSpin();
    const cells = this.activeCells();
    for (const [x, y] of cells) this._board[y][x] = p.type;
    this._active = null;

    // Lock out: the whole piece is above the visible field.
    if (cells.every(([, y]) => y < BUFFER_HEIGHT)) {
      if (this.topOut()) this.nextPiece();
      return;
    }

    const cleared = this.clearLines();
    const perfectClear = cleared > 0 && this._board.every((row) => row.every((c) => c === null));
    const result = scoreClear({
      lines: cleared,
      tspin,
      level: this.level,
      perfectClear,
      b2b: this.b2b,
      combo: this.combo,
    });
    this.score += result.points;
    this.b2b = result.b2b;
    this.combo = result.combo;
    if (result.labels.length > 0) {
      this.lastClear = { labels: result.labels, points: result.points, at: this.time };
    }

    this.lines += cleared;
    const goal = this.mode.lineGoal;
    if (goal !== null) this.lines = Math.min(this.lines, goal);
    this.level = this.mode.level(this.lines);
    if (this.lines === goal) {
      this.status = 'complete';
      return;
    }
    this.nextPiece();
  }

  private nextPiece(): void {
    this.holdUsed = false;
    this.spawn(this.takeNext());
  }

  /**
   * Handles a block out or lock out. Returns true when play continues (the
   * board was cleared), false when the game is over.
   */
  private topOut(): boolean {
    if (this.mode.topOut === 'end') {
      this.status = 'gameover';
      return false;
    }
    this._board = emptyBoard();
    this.combo = -1;
    this.b2b = false;
    this.boardResets++;
    this.lastClear = { labels: ['BOARD CLEARED'], points: 0, at: this.time };
    return true;
  }

  /** Pushes the stack up one row and adds a garbage row with one hole at the bottom. */
  private rise(): void {
    if (this._board[0].some((c) => c !== null)) {
      // Blocks would be pushed off the top of the buffer.
      this.status = 'gameover';
      return;
    }
    if (this.holeX === null) {
      this.holeX = Math.floor(this.garbageRng() * WIDTH);
    } else if (this.garbageRng() < GARBAGE_HOLE_CHANGE) {
      this.holeX = (this.holeX + 1 + Math.floor(this.garbageRng() * (WIDTH - 1))) % WIDTH;
    }
    const row = Array<BoardCell>(WIDTH).fill('G');
    row[this.holeX] = null;
    this._board.shift();
    this._board.push(row);
    this.rises++;

    const p = this._active;
    if (!p) return;
    // A piece the stack now overlaps is pushed up on top of it. lowestY is left
    // alone: being pushed up is not a descent, so it never refreshes lock resets.
    while (this.collides(p.type, p.rot, p.x, p.y)) {
      p.y--;
      this.lastMoveRotation = false;
      if (this.activeCells().some(([, y]) => y < 0)) {
        // Pushed off the top of the buffer.
        this.status = 'gameover';
        return;
      }
    }
  }

  private clearLines(): number {
    const remaining = this._board.filter((row) => row.some((c) => c === null));
    const cleared = HEIGHT - remaining.length;
    while (remaining.length < HEIGHT) remaining.unshift(Array<BoardCell>(WIDTH).fill(null));
    this._board = remaining;
    return cleared;
  }
}
