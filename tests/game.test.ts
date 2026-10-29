import { describe, expect, it } from 'vitest';
import { Bag } from '../src/game/bag';
import {
  Game,
  HEIGHT,
  LOCK_DELAY_MS,
  boardFromRows,
  gravityMs,
} from '../src/game/game';
import { PIECE_TYPES, getKicks, pieceCells } from '../src/game/pieces';
import { scoreClear } from '../src/game/scoring';
import { seeded } from './helpers';

const B = HEIGHT - 1; // bottom row index

describe('pieces', () => {
  it('T rotates clockwise into R state', () => {
    expect([...pieceCells('T', 1)].sort()).toEqual(
      [[1, 0], [1, 1], [1, 2], [2, 1]].sort(),
    );
  });

  it('I occupies column 2 in R state', () => {
    expect(pieceCells('I', 1).every(([x]) => x === 2)).toBe(true);
  });

  it('uses y-down SRS kicks', () => {
    expect(getKicks('T', 0, 1)).toEqual([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]);
    expect(getKicks('I', 0, 1)).toEqual([[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]]);
    expect(getKicks('O', 0, 1)).toEqual([[0, 0]]);
  });
});

describe('bag', () => {
  it('deals every piece once per 7', () => {
    const bag = new Bag(seeded(42));
    for (let round = 0; round < 5; round++) {
      const set = Array.from({ length: 7 }, () => bag.next()).sort();
      expect(set).toEqual([...PIECE_TYPES].sort());
    }
  });
});

describe('game', () => {
  it('spawns in the buffer and drops one row', () => {
    const game = new Game({ rng: seeded(3) });
    const ys = game.activeCells().map(([, y]) => y);
    expect(game.active!.x).toBe(3);
    expect(Math.max(...ys)).toBe(20);
    expect(game.pieceCount).toBe(1);
  });

  it('wall kicks an I piece off the left wall', () => {
    const game = new Game({ piece: { type: 'I', rot: 1, x: -2, y: 30 } });
    expect(game.rotate(1)).toBe(true);
    expect(game.activeCells().every(([x]) => x >= 0)).toBe(true);
  });

  it('locks after the lock delay on the floor', () => {
    const game = new Game({ piece: { type: 'O', rot: 0, x: 3, y: B - 1 } });
    game.update(LOCK_DELAY_MS - 1);
    expect(game.board[B][4]).toBeNull();
    game.update(2);
    expect(game.board[B][4]).toBe('O');
    expect(game.pieceCount).toBe(2);
  });

  it('move resets lock delay at most 15 times', () => {
    const game = new Game({ piece: { type: 'O', rot: 0, x: 3, y: B - 1 } });
    let resets = 0;
    for (let i = 0; i < 20; i++) {
      game.update(LOCK_DELAY_MS - 10);
      if (game.pieceCount > 1) break;
      if (i % 2 === 0) game.moveLeft();
      else game.moveRight();
      resets++;
    }
    expect(resets).toBe(15);
  });

  it('does not jump several rows when soft drop starts mid-fall', () => {
    const game = new Game({ softDropFactor: 20, piece: { type: 'T', rot: 0, x: 3, y: 25 } });
    game.update(900); // just under one row at level 1
    expect(game.active!.y).toBe(25);
    game.setSoftDrop(true);
    game.update(16);
    expect(game.active!.y).toBeLessThanOrEqual(26);
  });

  it('holds once per piece', () => {
    const game = new Game({ rng: seeded(3) });
    const first = game.active!.type;
    const next = game.queue[0];
    expect(game.holdPiece()).toBe(true);
    expect(game.hold).toBe(first);
    expect(game.active!.type).toBe(next);
    expect(game.holdPiece()).toBe(false);
  });

  it('scores a T-spin double', () => {
    const game = new Game({
      board: boardFromRows([
        '...#......', // overhang
        '###...####',
        '####.#####',
      ]),
      piece: { type: 'T', rot: 1, x: 3, y: B - 2 },
    });
    expect(game.rotate(1)).toBe(true);
    expect(game.detectTSpin()).toBe('full');
    game.hardDrop();
    expect(game.lines).toBe(2);
    expect(game.score).toBe(1200);
    expect(game.b2b).toBe(true);
    expect(game.lastClear?.labels).toEqual(['T-SPIN DOUBLE']);
  });

  it('does not count a T that only moved as a T-spin', () => {
    const game = new Game({
      board: boardFromRows([
        '...#.#....',
        '###...####',
      ]),
      piece: { type: 'T', rot: 2, x: 2, y: B - 2 },
    });
    game.moveRight();
    expect(game.detectTSpin()).toBe('none');
  });

  it('awards a perfect clear', () => {
    const game = new Game({
      board: boardFromRows(['.#########', '.#########', '.#########', '.#########']),
      piece: { type: 'I', rot: 1, x: -2, y: B - 3 },
    });
    game.hardDrop();
    expect(game.lines).toBe(4);
    expect(game.score).toBe(800 + 2000);
    expect(game.lastClear?.labels).toEqual(['QUAD', 'PERFECT CLEAR']);
  });

  it('ends in game over when the spawn is blocked', () => {
    const game = new Game({
      board: boardFromRows(Array(HEIGHT).fill('.#########')),
      piece: { type: 'I', rot: 1, x: -2, y: B - 3 },
    });
    game.hardDrop();
    // The I clears 4 rows but the stack still covers the spawn area.
    expect(game.status).toBe('gameover');
  });

  it('speeds up gravity with level', () => {
    expect(gravityMs(1)).toBe(1000);
    expect(gravityMs(10)).toBeLessThan(gravityMs(9));
  });
});

describe('scoring', () => {
  const base = { level: 1, perfectClear: false, b2b: false, combo: -1 };

  it('applies the back-to-back bonus', () => {
    const r = scoreClear({ ...base, lines: 4, tspin: 'none', b2b: true });
    expect(r.points).toBe(1200);
    expect(r.labels[0]).toBe('B2B QUAD');
  });

  it('breaks back-to-back on an easy clear', () => {
    const r = scoreClear({ ...base, lines: 1, tspin: 'none', b2b: true });
    expect(r.b2b).toBe(false);
  });

  it('keeps back-to-back on a T-spin with no lines', () => {
    const r = scoreClear({ ...base, lines: 0, tspin: 'full', b2b: true });
    expect(r.b2b).toBe(true);
    expect(r.points).toBe(400);
  });

  it('adds combo points', () => {
    const r = scoreClear({ ...base, lines: 1, tspin: 'none', combo: 2, level: 2 });
    expect(r.combo).toBe(3);
    expect(r.points).toBe(100 * 2 + 50 * 3 * 2);
    expect(r.labels).toContain('3 REN');
  });

  it('scores a T-spin mini single', () => {
    const r = scoreClear({ ...base, lines: 1, tspin: 'mini' });
    expect(r.points).toBe(200);
    expect(r.b2b).toBe(true);
  });

  it('gives the B2B quad perfect clear bonus', () => {
    const r = scoreClear({ ...base, lines: 4, tspin: 'none', b2b: true, perfectClear: true });
    expect(r.points).toBe(1200 + 3200);
  });
});
