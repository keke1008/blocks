// Random play: thousands of random presses, releases and frame lengths,
// checking rules that must hold no matter what the player does.

import { describe, expect, it } from 'vitest';
import { HEIGHT, WIDTH, type GameStatus } from '../src/game/game';
import { MODES, RISING, type Mode } from '../src/game/modes';
import { ACTIONS, SDF_OPTIONS } from '../src/settings';
import { Replay, seeded } from './helpers';

interface Reached {
  gameover: number;
  rises: number;
  boardResets: number;
}

/**
 * Every mode, plus Rising with garbage fast enough to reach the top within a run.
 * `expect` lists states the random runs must reach, so the invariants are known to
 * have been checked there (a change that makes them unreachable fails the test).
 */
const FUZZ_MODES: readonly { name: string; mode: Mode; expect: (keyof Reached)[] }[] = [
  ...MODES.map((mode) => ({
    name: mode.id,
    mode,
    expect: [
      ...(mode.riseInterval ? (['rises'] as const) : []),
      ...(mode.topOut === 'clear' ? (['boardResets'] as const) : []),
    ],
  })),
  { name: 'rising (fast garbage)', mode: { ...RISING, riseInterval: () => 400 }, expect: ['rises', 'gameover'] },
];
const RUNS = 150;
const FRAMES = 1500;

/** Plain assertion: `expect` is too slow for millions of checks. */
function check(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}

describe('random play invariants', () => {
  it.each(FUZZ_MODES)('holds for random inputs, settings and frame times: $name', ({ mode, expect: wanted }) => {
    const reached: Reached = { gameover: 0, rises: 0, boardResets: 0 };
    for (let seed = 1; seed <= RUNS; seed++) {
      const rnd = seeded(seed * 7919);
      const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
      const settings = {
        das: Math.floor(rnd() * 300),
        arr: rnd() < 0.2 ? 0 : Math.floor(rnd() * 100) + 1,
        sdf: pick(SDF_OPTIONS),
      };
      const r = new Replay({ mode, rng: seeded(seed), garbageRng: seeded(seed + 1) }, settings);
      const g = r.game;
      const ctx = `${mode.id} seed ${seed} ${JSON.stringify(settings)}`;

      for (let f = 0; f < FRAMES && g.status === 'playing'; f++) {
        // Random input between frames (rarely hard drop so stacks grow slowly).
        if (rnd() < 0.15) {
          const action = pick(ACTIONS);
          if (action !== 'hard' || rnd() < 0.2) {
            if (rnd() < 0.5) r.press(action);
            else r.release(action);
          }
        }

        const before = {
          ...g.active!,
          piece: g.pieceCount,
          score: g.score,
          lines: g.lines,
          rises: g.rises,
          resets: g.boardResets,
        };
        const dt = 1 + Math.floor(rnd() * 33);
        const soft = g.softDropping;
        r.step(dt);
        // Read after the step (TypeScript would keep the loop condition's narrowing of g.status).
        const status = g.status as GameStatus;
        // Only modes that can end, end; and only by their own rules.
        if (mode.topOut === 'clear') check(status === 'playing', `${ctx}: ${mode.id} ended at frame ${f}`);
        if (status === 'complete') check(g.lines === mode.lineGoal, `${ctx}: completed at ${g.lines} lines`);
        if (status !== 'playing') break;
        const p = g.active!;

        // The active piece is always inside the field and never overlaps blocks.
        check(!g.collides(p.type, p.rot, p.x, p.y), `${ctx}: piece overlaps at frame ${f}`);
        // Score and lines never go down; level follows lines.
        check(g.score >= before.score, `${ctx}: score went down at frame ${f}`);
        check(g.lines >= before.lines, `${ctx}: lines went down at frame ${f}`);
        check(g.level === mode.level(g.lines), `${ctx}: level ${g.level} for ${g.lines} lines`);
        if (mode.lineGoal !== null) check(g.lines < mode.lineGoal, `${ctx}: ${g.lines} lines still playing`);
        // Garbage only in modes that have it; the board is only reset in modes that allow it.
        if (!mode.riseInterval) check(g.rises === 0, `${ctx}: garbage rose in ${mode.id}`);
        if (mode.topOut === 'end') check(g.boardResets === 0, `${ctx}: board reset in ${mode.id}`);

        if (g.pieceCount === before.piece) {
          // Gravity can move a piece at most ceil(dt / interval) rows per frame.
          const interval = soft ? g.softDropInterval() : g.gravityInterval();
          const maxRows = Math.ceil(dt / interval);
          // Rising garbage may push the piece up by as many rows as rose this frame.
          const pushed = g.rises - before.rises;
          const dy = p.y - before.y;
          check(dy <= maxRows, `${ctx}: fell ${dy} rows (max ${maxRows}) in ${dt}ms at frame ${f}`);
          check(dy >= -pushed, `${ctx}: piece moved up ${-dy} rows (${pushed} rises) at frame ${f}`);
          // Auto-repeat moves at most one column per ARR (wall to wall at ARR 0).
          const maxCols = settings.arr === 0 ? WIDTH : Math.ceil(dt / settings.arr) + 1;
          const dx = Math.abs(p.x - before.x);
          check(dx <= maxCols, `${ctx}: moved ${dx} columns (max ${maxCols}) at frame ${f}`);
        }
      }

      expect(g.board.length).toBe(HEIGHT);
      expect(g.board.every((row) => row.length === WIDTH)).toBe(true);
      reached.gameover += Number(g.status === 'gameover');
      reached.rises += g.rises;
      reached.boardResets += g.boardResets;
    }
    for (const key of wanted) expect(reached[key], `${mode.id} never reached ${key}`).toBeGreaterThan(0);
  });
});
