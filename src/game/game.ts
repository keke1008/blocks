import { Bag, type Rng } from './bag';
import { getKicks, pieceCells, type Cell, type PieceType, type Rotation } from './pieces';
import { scoreClear, type TSpin } from './scoring';

export const WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
/** Rows above the visible field where pieces spawn. */
export const BUFFER_HEIGHT = 20;
export const HEIGHT = VISIBLE_HEIGHT + BUFFER_HEIGHT;

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const QUEUE_SIZE = 6;
export const MARATHON_LINES = 150;

export type BoardCell = PieceType | null;
export type Board = BoardCell[][];

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
  rng?: Rng;
  /** Soft drop gravity multiplier. Infinity drops to the floor instantly. */
  softDropFactor?: number;
}

/** Guideline gravity: seconds per row = (0.8 - (level - 1) * 0.007) ^ (level - 1). */
export function gravityMs(level: number): number {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

export function emptyBoard(): Board {
  return Array.from({ length: HEIGHT }, () => Array<BoardCell>(WIDTH).fill(null));
}

export class Game {
  board: Board = emptyBoard();
  active: ActivePiece | null = null;
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

  softDropping = false;
  softDropFactor: number;

  private bag: Bag;
  private gravityAcc = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private lowestY = 0;
  private lastMoveRotation = false;
  private lastKickIndex = 0;

  constructor(options: GameOptions = {}) {
    this.bag = new Bag(options.rng);
    this.softDropFactor = options.softDropFactor ?? 20;
    while (this.queue.length < QUEUE_SIZE) this.queue.push(this.bag.next());
    this.spawn(this.takeNext());
  }

  // ---------------------------------------------------------------- queries

  collides(type: PieceType, rot: Rotation, x: number, y: number): boolean {
    for (const [cx, cy] of pieceCells(type, rot)) {
      const bx = x + cx;
      const by = y + cy;
      if (bx < 0 || bx >= WIDTH || by < 0 || by >= HEIGHT) return true;
      if (this.board[by][bx] !== null) return true;
    }
    return false;
  }

  /** Board cells occupied by the active piece. */
  activeCells(): Cell[] {
    const p = this.active;
    if (!p) return [];
    return pieceCells(p.type, p.rot).map(([cx, cy]) => [p.x + cx, p.y + cy] as const);
  }

  /** y position where the active piece would land. */
  ghostY(): number {
    const p = this.active;
    if (!p) return 0;
    let y = p.y;
    while (!this.collides(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }

  isGrounded(): boolean {
    const p = this.active;
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
    const p = this.active;
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
    const p = this.active;
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
    const p = this.active;
    if (!p || this.holdUsed || this.status !== 'playing') return false;
    const next = this.hold ?? this.takeNext();
    this.hold = p.type;
    this.holdUsed = true;
    this.spawn(next);
    return true;
  }

  /** Advance the game by `dt` milliseconds (gravity, soft drop and lock delay). */
  update(dt: number): void {
    if (this.status !== 'playing' || !this.active) return;
    this.time += dt;

    const base = gravityMs(this.level);
    const interval = this.softDropping ? base / this.softDropFactor : base;

    if (this.isGrounded()) {
      this.gravityAcc = 0;
    } else if (interval <= 0) {
      this.dropRows(Infinity, true);
    } else {
      this.gravityAcc += dt;
      const rows = Math.floor(this.gravityAcc / interval);
      if (rows > 0) {
        this.gravityAcc -= rows * interval;
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
    const p = this.active;
    if (!p || this.status !== 'playing') return false;
    if (this.collides(p.type, p.rot, p.x + dx, p.y)) return false;
    p.x += dx;
    this.lastMoveRotation = false;
    this.afterMove();
    return true;
  }

  private dropRows(rows: number, soft: boolean): void {
    const p = this.active!;
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
    const p = this.active!;
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
    if (this.collides(type, 0, x, y)) {
      // Block out.
      this.active = { type, rot: 0, x, y };
      this.status = 'gameover';
      return;
    }
    this.active = { type, rot: 0, x, y };
    // Guideline: drop one row immediately if nothing is in the way.
    if (!this.collides(type, 0, x, y + 1)) this.active.y++;
    this.lowestY = this.active.y;
  }

  /** 3-corner T-spin detection. Must be called before the piece is merged. */
  detectTSpin(): TSpin {
    const p = this.active;
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
    return this.board[y][x] !== null;
  }

  private lock(): void {
    const p = this.active;
    if (!p) return;
    const tspin = this.detectTSpin();
    const cells = this.activeCells();
    for (const [x, y] of cells) this.board[y][x] = p.type;
    this.active = null;

    // Lock out: the whole piece is above the visible field.
    if (cells.every(([, y]) => y < BUFFER_HEIGHT)) {
      this.status = 'gameover';
      return;
    }

    const cleared = this.clearLines();
    const perfectClear = cleared > 0 && this.board.every((row) => row.every((c) => c === null));
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
    this.level = Math.floor(this.lines / 10) + 1;
    if (this.lines >= MARATHON_LINES) {
      this.lines = Math.min(this.lines, MARATHON_LINES);
      this.level = Math.min(this.level, MARATHON_LINES / 10);
      this.status = 'complete';
      return;
    }

    this.holdUsed = false;
    this.spawn(this.takeNext());
  }

  private clearLines(): number {
    const remaining = this.board.filter((row) => row.some((c) => c === null));
    const cleared = HEIGHT - remaining.length;
    while (remaining.length < HEIGHT) remaining.unshift(Array<BoardCell>(WIDTH).fill(null));
    this.board = remaining;
    return cleared;
  }
}
