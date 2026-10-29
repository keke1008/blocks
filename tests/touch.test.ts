import { describe, expect, it } from 'vitest';
import { defaultButtons } from '../src/settings';
import { LayoutDrag, TouchRouter, nearestAction, type Layout } from '../src/touch';

const view = { width: 1000, height: 400 };

/** Pixel position of a marker in the default layout. */
function at(layout: Layout, action: keyof Layout): [number, number] {
  return [layout[action].x * view.width, layout[action].y * view.height];
}

function setup() {
  const layout = defaultButtons();
  const router = new TouchRouter(() => layout, () => view);
  return { layout, router };
}

describe('nearestAction', () => {
  it('picks the closest marker even far from any marker', () => {
    const layout = defaultButtons();
    expect(nearestAction(layout, view, 0, layout.left.y * view.height)).toBe('left');
    expect(nearestAction(layout, view, view.width, layout.rotR.y * view.height)).toBe('rotR');
  });

  it('hits each marker at its own center', () => {
    const layout = defaultButtons();
    for (const a of Object.keys(layout) as (keyof Layout)[]) {
      expect(nearestAction(layout, view, ...at(layout, a))).toBe(a);
    }
  });
});

describe('TouchRouter', () => {
  it('presses on down and releases on up', () => {
    const { layout, router } = setup();
    expect(router.down(1, ...at(layout, 'hold'))).toEqual([{ type: 'press', action: 'hold' }]);
    expect(router.up(1)).toEqual([{ type: 'release', action: 'hold' }]);
  });

  it('slides between movement actions', () => {
    const { layout, router } = setup();
    router.down(1, ...at(layout, 'left'));
    expect(router.move(1, ...at(layout, 'right'))).toEqual([
      { type: 'release', action: 'left' },
      { type: 'press', action: 'right' },
    ]);
    expect(router.move(1, ...at(layout, 'soft'))).toEqual([
      { type: 'release', action: 'right' },
      { type: 'press', action: 'soft' },
    ]);
  });

  it('never slides into hard drop, rotations or hold', () => {
    const { layout, router } = setup();
    router.down(1, ...at(layout, 'left'));
    for (const a of ['hard', 'rotL', 'rotR', 'hold'] as const) {
      expect(router.move(1, ...at(layout, a))).toEqual([]);
    }
    expect(router.isHeld('left')).toBe(true);
  });

  it('does not slide off a one-shot action', () => {
    const { layout, router } = setup();
    router.down(1, ...at(layout, 'hard'));
    expect(router.move(1, ...at(layout, 'left'))).toEqual([]);
    expect(router.up(1)).toEqual([{ type: 'release', action: 'hard' }]);
  });

  it('keeps an action held while any finger holds it', () => {
    const { layout, router } = setup();
    expect(router.down(1, ...at(layout, 'left'))).toHaveLength(1);
    expect(router.down(2, ...at(layout, 'left'))).toEqual([]);
    expect(router.up(1)).toEqual([]);
    expect(router.up(2)).toEqual([{ type: 'release', action: 'left' }]);
  });

  it('handles independent fingers at once', () => {
    const { layout, router } = setup();
    router.down(1, ...at(layout, 'left'));
    expect(router.down(2, ...at(layout, 'rotR'))).toEqual([{ type: 'press', action: 'rotR' }]);
    expect(router.isHeld('left')).toBe(true);
    expect(router.up(2)).toEqual([{ type: 'release', action: 'rotR' }]);
    expect(router.isHeld('left')).toBe(true);
  });

  it('ignores moves and ups from unknown fingers', () => {
    const { router } = setup();
    expect(router.move(9, 0, 0)).toEqual([]);
    expect(router.up(9)).toEqual([]);
  });

  it('releases everything once', () => {
    const { layout, router } = setup();
    router.down(1, ...at(layout, 'left'));
    router.down(2, ...at(layout, 'left'));
    router.down(3, ...at(layout, 'soft'));
    expect(router.releaseAll()).toEqual([
      { type: 'release', action: 'left' },
      { type: 'release', action: 'soft' },
    ]);
    expect(router.up(1)).toEqual([]);
  });
});

describe('LayoutDrag', () => {
  it('drags the nearest marker by the finger offset', () => {
    const layout = defaultButtons();
    const drag = new LayoutDrag(() => layout, () => view);
    const [x, y] = at(layout, 'hold');
    expect(drag.start(1, x + 5, y + 5)).toBe('hold');
    expect(drag.move(1, x + 105, y + 45)).toBe(true);
    expect(layout.hold.x * view.width).toBeCloseTo(x + 100);
    expect(layout.hold.y * view.height).toBeCloseTo(y + 40);
    expect(drag.end(1)).toBe(true);
    expect(drag.move(1, 0, 0)).toBe(false);
  });

  it('keeps markers on screen and ignores other fingers', () => {
    const layout = defaultButtons();
    const drag = new LayoutDrag(() => layout, () => view);
    drag.start(1, ...at(layout, 'left'));
    expect(drag.move(2, 500, 200)).toBe(false);
    drag.move(1, -500, 9999);
    expect(layout.left).toEqual({ x: 0, y: 1 });
  });
});
