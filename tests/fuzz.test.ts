// Random play: thousands of random presses, releases and frame lengths,
// checking rules that must hold no matter what the player does.

import { describe, expect, it } from 'vitest';
import { HEIGHT, WIDTH, gravityMs } from '../src/game/game';
import { ACTIONS, SDF_OPTIONS } from '../src/settings';
import { Replay, seeded } from './helpers';

const RUNS = 150;
const FRAMES = 1500;

/** Plain assertion: `expect` is too slow for millions of checks. */
function check(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}

describe('random play invariants', () => {
  it('holds for random inputs, settings and frame times', () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const rnd = seeded(seed * 7919);
      const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
      const settings = {
        das: Math.floor(rnd() * 300),
        arr: rnd() < 0.2 ? 0 : Math.floor(rnd() * 100) + 1,
        sdf: pick(SDF_OPTIONS),
      };
      const r = new Replay({ rng: seeded(seed) }, settings);
      const g = r.game;
      const ctx = `seed ${seed} ${JSON.stringify(settings)}`;

      for (let f = 0; f < FRAMES && g.status === 'playing'; f++) {
        // Random input between frames (rarely hard drop so stacks grow slowly).
        if (rnd() < 0.15) {
          const action = pick(ACTIONS);
          if (action !== 'hard' || rnd() < 0.2) {
            if (rnd() < 0.5) r.press(action);
            else r.release(action);
          }
        }

        const before = { ...g.active!, piece: g.pieceCount, score: g.score, lines: g.lines };
        const dt = 1 + Math.floor(rnd() * 33);
        const soft = g.softDropping;
        r.step(dt);
        if (g.status !== 'playing') break;
        const p = g.active!;

        // The active piece is always inside the field and never overlaps blocks.
        check(!g.collides(p.type, p.rot, p.x, p.y), `${ctx}: piece overlaps at frame ${f}`);
        // Score and lines never go down; level follows lines.
        check(g.score >= before.score, `${ctx}: score went down at frame ${f}`);
        check(g.lines >= before.lines, `${ctx}: lines went down at frame ${f}`);
        check(g.level === Math.floor(g.lines / 10) + 1, `${ctx}: level ${g.level} for ${g.lines} lines`);

        if (g.pieceCount === before.piece) {
          // Gravity can move a piece at most ceil(dt / interval) rows per frame.
          const factor = soft ? (settings.sdf === 0 ? Infinity : settings.sdf) : 1;
          const maxRows = Math.ceil(dt / (gravityMs(g.level) / factor));
          const dy = p.y - before.y;
          check(dy <= maxRows, `${ctx}: fell ${dy} rows (max ${maxRows}) in ${dt}ms at frame ${f}`);
          check(dy >= 0, `${ctx}: piece moved up during a frame at ${f}`);
          // Auto-repeat moves at most one column per ARR (wall to wall at ARR 0).
          const maxCols = settings.arr === 0 ? WIDTH : Math.ceil(dt / settings.arr) + 1;
          const dx = Math.abs(p.x - before.x);
          check(dx <= maxCols, `${ctx}: moved ${dx} columns (max ${maxCols}) at frame ${f}`);
        }
      }

      expect(g.board.length).toBe(HEIGHT);
      expect(g.board.every((row) => row.length === WIDTH)).toBe(true);
    }
  });
});
