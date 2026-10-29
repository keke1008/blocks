import { describe, expect, it } from 'vitest';
import { gravityMs } from '../src/game/game';
import { Replay } from './helpers';

const piece = { type: 'T', rot: 0, x: 4, y: 25 } as const;

describe('DAS / ARR', () => {
  it('moves once, waits for DAS, then repeats every ARR', () => {
    const r = new Replay({ piece }, { das: 170, arr: 50 });
    r.press('left');
    expect(r.game.active!.x).toBe(3);
    r.advance(160, 10);
    expect(r.game.active!.x).toBe(3);
    r.advance(20, 10); // DAS reached at 170; 10ms of repeat time so far
    expect(r.game.active!.x).toBe(3);
    r.advance(40, 10); // 50ms of repeat time
    expect(r.game.active!.x).toBe(2);
    r.advance(50, 10);
    expect(r.game.active!.x).toBe(1);
  });

  it('slides to the wall at ARR 0', () => {
    const r = new Replay({ piece }, { das: 100, arr: 0 });
    r.press('right').advance(90, 10);
    expect(r.game.active!.x).toBe(5);
    r.advance(10, 10);
    expect(r.game.active!.x).toBe(7); // T is 3 wide: x + 2 = 9
  });

  it('switches to the other direction with a fresh DAS', () => {
    const r = new Replay({ piece }, { das: 100, arr: 20 });
    r.press('left').press('right');
    expect(r.game.active!.x).toBe(4); // left then right
    r.advance(200, 10);
    const x = r.game.active!.x;
    expect(x).toBeGreaterThan(4);
    r.release('right'); // left is still held: restart DAS to the left
    expect(r.game.active!.x).toBe(x - 1);
    r.advance(90, 10);
    expect(r.game.active!.x).toBe(x - 1);
  });

  it('stops repeating on release', () => {
    const r = new Replay({ piece }, { das: 50, arr: 10 });
    r.press('left').advance(80, 10).release('left');
    const x = r.game.active!.x;
    r.advance(200, 10);
    expect(r.game.active!.x).toBe(x);
  });
});

describe('soft drop through input', () => {
  it('falls at the soft drop factor while held', () => {
    const r = new Replay({ piece }, { sdf: 20 });
    const rowMs = gravityMs(1) / 20;
    r.press('soft').advance(rowMs * 5, rowMs);
    expect(r.game.active!.y).toBe(30);
    r.release('soft').advance(rowMs * 5, rowMs);
    expect(r.game.active!.y).toBe(30);
  });

  it('starting soft drop late in a fall moves at most one row at once', () => {
    const r = new Replay({ piece }, { sdf: 20 });
    r.run([{ at: 950, press: 'soft' }]);
    expect(r.game.active!.y).toBe(25);
    r.advance(16, 16);
    expect(r.game.active!.y).toBeLessThanOrEqual(26);
  });

  it('drops to the floor instantly when set to instant', () => {
    const r = new Replay({ piece }, { sdf: 0 });
    r.press('soft').advance(16);
    expect(r.game.active!.y).toBe(r.game.ghostY());
  });
});
