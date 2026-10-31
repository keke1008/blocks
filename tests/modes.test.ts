import { describe, expect, it } from 'vitest';
import { BUFFER_HEIGHT, Game, HEIGHT, WIDTH, boardFromRows, type ActivePiece } from '../src/game/game';
import { MARATHON, MODES, RISING, SPRINT, ZEN, gravityMs, modeById, riseIntervalMs } from '../src/game/modes';
import { formatTime, hudStats, resultText } from '../src/hud';
import { isBetter, loadRecord, resultValue, saveRecord } from '../src/records';
import { seeded } from './helpers';

const B = HEIGHT - 1;
/** Vertical I in the leftmost column, just above four '.#########' rows. */
const quadI: ActivePiece = { type: 'I', rot: 1, x: -2, y: B - 3 };
const quadRows = ['.#########', '.#########', '.#########', '.#########'];

describe('mode table', () => {
  it('has unique ids that look up the same mode', () => {
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length);
    for (const m of MODES) expect(modeById(m.id)).toBe(m);
    expect(modeById('nope')).toBeUndefined();
  });

  it('defaults to Marathon', () => {
    expect(new Game().mode).toBe(MARATHON);
  });
});

describe('marathon', () => {
  it('levels up every 10 lines', () => {
    const game = new Game({ board: boardFromRows(quadRows), piece: quadI });
    game.lines = 8;
    game.hardDrop();
    expect(game.level).toBe(2);
  });

  it('completes at 150 lines at level 15', () => {
    const game = new Game({ board: boardFromRows(quadRows), piece: quadI });
    game.lines = 148;
    game.hardDrop();
    expect(game.status).toBe('complete');
    expect(game.lines).toBe(150);
    expect(game.level).toBe(15);
  });
});

describe('sprint', () => {
  it('stays at level 1', () => {
    const game = new Game({ mode: SPRINT, board: boardFromRows(quadRows), piece: quadI });
    game.lines = 8;
    game.hardDrop();
    expect(game.lines).toBe(12);
    expect(game.level).toBe(1);
  });

  it('completes at 40 lines and records the time', () => {
    const game = new Game({ mode: SPRINT, board: boardFromRows(quadRows), piece: quadI });
    game.lines = 38;
    game.update(400);
    game.hardDrop();
    expect(game.status).toBe('complete');
    expect(game.lines).toBe(40);
    expect(resultValue(game)).toBe(400);
    expect(resultText(game)).toEqual({ title: 'Complete!', label: 'Time', value: '0:00.40' });
  });

  it('records nothing on game over', () => {
    const game = new Game({ mode: SPRINT });
    game.status = 'gameover';
    expect(resultValue(game)).toBeNull();
    expect(resultText(game).label).toBe('Lines');
  });
});

describe('zen', () => {
  const piece: ActivePiece = { type: 'T', rot: 0, x: 3, y: 25 };

  it('has no gravity', () => {
    const game = new Game({ mode: ZEN, piece });
    game.update(60_000);
    expect(game.active!.y).toBe(25);
    expect(game.pieceCount).toBe(1);
  });

  it('still soft drops, at level 1 speed times the factor', () => {
    const game = new Game({ mode: ZEN, piece, softDropFactor: 20 });
    game.setSoftDrop(true);
    game.update(gravityMs(1) / 20 * 2);
    expect(game.active!.y).toBe(27);
  });

  it('soft drops to the floor at instant speed', () => {
    const game = new Game({ mode: ZEN, piece, softDropFactor: Infinity });
    game.setSoftDrop(true);
    game.update(16);
    expect(game.isGrounded()).toBe(true);
  });

  it('clears the board on block out and keeps playing', () => {
    const game = new Game({
      mode: ZEN,
      board: boardFromRows(Array(HEIGHT).fill('.#########')),
      piece: quadI,
    });
    game.hardDrop();
    expect(game.status).toBe('playing');
    expect(game.boardResets).toBe(1);
    expect(game.board.flat().every((c) => c === null)).toBe(true);
    expect(game.lines).toBe(4);
    expect(game.lastClear?.labels).toEqual(['BOARD CLEARED']);
  });

  it('clears the board on lock out and keeps playing', () => {
    const rows = Array(HEIGHT - BUFFER_HEIGHT).fill('#########.');
    const lockOut: ActivePiece = { type: 'O', rot: 0, x: 3, y: BUFFER_HEIGHT - 2 };
    const zen = new Game({ mode: ZEN, board: boardFromRows(rows), piece: lockOut });
    zen.hardDrop();
    expect(zen.status).toBe('playing');
    expect(zen.boardResets).toBe(1);
    expect(zen.pieceCount).toBe(2);

    const marathon = new Game({ board: boardFromRows(rows), piece: lockOut });
    marathon.hardDrop();
    expect(marathon.status).toBe('gameover');
  });

  it('never keeps a record', () => {
    const game = new Game({ mode: ZEN });
    game.score = 1000;
    expect(resultValue(game)).toBeNull();
  });
});

describe('rising', () => {
  const fast = { ...RISING, riseInterval: () => 1000 };

  it('raises the interval schedule from 8 s down to 2 s', () => {
    expect(riseIntervalMs(1)).toBe(8000);
    expect(riseIntervalMs(2)).toBe(7500);
    expect(riseIntervalMs(13)).toBe(2000);
    expect(riseIntervalMs(30)).toBe(2000);
  });

  it('pushes the stack up and adds a garbage row with one hole', () => {
    const game = new Game({
      mode: fast,
      garbageRng: seeded(5),
      board: boardFromRows(['#.........']),
      piece: { type: 'T', rot: 0, x: 3, y: 25 },
    });
    game.update(999);
    expect(game.rises).toBe(0);
    expect(game.riseProgress).toBeCloseTo(0.999);
    game.update(1);
    expect(game.rises).toBe(1);
    expect(game.board[B - 1][0]).toBe('Z');
    expect(game.board[B].filter((c) => c === null)).toHaveLength(1);
    expect(game.board[B].filter((c) => c === 'G')).toHaveLength(WIDTH - 1);
    expect(game.active!.y).toBe(26); // gravity only; not pushed
  });

  it('pushes the active piece up when the stack rises into it', () => {
    const game = new Game({
      mode: { ...RISING, riseInterval: () => 300 }, // rises before the lock delay ends
      garbageRng: seeded(5),
      board: boardFromRows(['#########.']),
      piece: { type: 'O', rot: 0, x: 3, y: B - 2 }, // resting on the bottom row
    });
    game.update(300);
    expect(game.pieceCount).toBe(1);
    expect(game.active!.y).toBe(B - 3);
    expect(game.collides(game.active!.type, game.active!.rot, game.active!.x, game.active!.y)).toBe(false);
  });

  it('every garbage row has exactly one hole', () => {
    const game = new Game({
      mode: { ...RISING, riseInterval: () => 10 },
      garbageRng: seeded(9),
      piece: { type: 'O', rot: 0, x: 3, y: 0 },
    });
    for (let i = 0; i < 15; i++) game.update(10);
    expect(game.rises).toBe(15);
    for (let y = B - 14; y <= B; y++) {
      expect(game.board[y].filter((c) => c === null)).toHaveLength(1);
    }
  });

  it('ends when blocks would be pushed off the top', () => {
    const rows = Array(HEIGHT).fill('..........');
    rows[0] = '#.........';
    const game = new Game({ mode: fast, board: boardFromRows(rows), piece: { type: 'T', rot: 0, x: 3, y: 25 } });
    game.update(1000);
    expect(game.status).toBe('gameover');
  });

  it('is endless and keeps levelling', () => {
    const game = new Game({ mode: RISING, board: boardFromRows(quadRows), piece: quadI });
    game.lines = 196;
    game.hardDrop();
    expect(game.status).toBe('playing');
    expect(game.level).toBe(21);
  });
});

describe('records', () => {
  it('compares by score or time', () => {
    expect(isBetter('score', 100, null)).toBe(true);
    expect(isBetter('score', 0, null)).toBe(false);
    expect(isBetter('score', 100, 200)).toBe(false);
    expect(isBetter('score', 300, 200)).toBe(true);
    expect(isBetter('time', 50_000, null)).toBe(true);
    expect(isBetter('time', 50_000, 60_000)).toBe(true);
    expect(isBetter('time', 70_000, 60_000)).toBe(false);
    expect(isBetter('none', 1, null)).toBe(false);
  });

  it('stores one record per mode, keeping the old Marathon key', () => {
    const store = new Map<string, string>([['blocks.best.v1', '12345']]);
    const g = globalThis as { localStorage?: unknown };
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    try {
      expect(loadRecord(MARATHON)).toBe(12345);
      expect(loadRecord(SPRINT)).toBeNull();
      saveRecord(SPRINT, 61_230);
      expect(loadRecord(SPRINT)).toBe(61_230);
      expect(loadRecord(MARATHON)).toBe(12345);
      expect(loadRecord(ZEN)).toBeNull();
    } finally {
      delete g.localStorage;
    }
  });
});

describe('hud', () => {
  it('formats times as m:ss.cc', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(83_456)).toBe('1:23.45');
    expect(formatTime(600_000)).toBe('10:00.00');
  });

  it('shows mode-specific stats', () => {
    const labels = (m: (typeof MODES)[number]) => hudStats(m, null, null).map(([l]) => l);
    expect(labels(MARATHON)).toEqual(['SCORE', 'BEST', 'LEVEL', 'LINES']);
    expect(labels(SPRINT)).toEqual(['TIME', 'BEST', 'LINES', 'SCORE']);
    expect(labels(ZEN)).toEqual(['SCORE', 'LINES', 'TIME']);
    expect(labels(RISING)).toEqual(['SCORE', 'BEST', 'LEVEL', 'LINES']);
    expect(hudStats(SPRINT, null, 61_230)).toContainEqual(['BEST', '1:01.23']);
    expect(hudStats(SPRINT, null, null)).toContainEqual(['LINES', '0/40']);
  });

  it('shows the live score as best once it passes the record', () => {
    const game = new Game();
    game.score = 500;
    expect(hudStats(MARATHON, game, 300)).toContainEqual(['BEST', '500']);
    expect(hudStats(MARATHON, game, 900)).toContainEqual(['BEST', '900']);
  });
});
