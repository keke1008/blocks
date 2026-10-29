// Touch routing without the DOM: turns pointer down/move/up (id + position)
// into action press/release events, given the marker layout and viewport.

import { ACTIONS, type Action, type ButtonLayout } from './settings';

export type Layout = Record<Action, ButtonLayout>;

export interface Viewport {
  width: number;
  height: number;
}

export interface ControlEvent {
  type: 'press' | 'release';
  action: Action;
}

/** Actions a finger may slide between while held (like a D-pad). */
export const SLIDE_ACTIONS: readonly Action[] = ['left', 'right', 'soft'];

/** The action whose marker is closest to (x, y) in CSS pixels. */
export function nearestAction(layout: Layout, view: Viewport, x: number, y: number): Action {
  let best: Action = ACTIONS[0];
  let bestDist = Infinity;
  for (const a of ACTIONS) {
    const b = layout[a];
    const d = Math.hypot(x - b.x * view.width, y - b.y * view.height);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

/**
 * Tracks which action each finger holds. An action stays pressed while at
 * least one finger holds it. Movement fingers can slide between SLIDE_ACTIONS;
 * other actions fire on touch only and are never entered by sliding.
 */
export class TouchRouter {
  private fingers = new Map<number, Action>();

  constructor(
    private getLayout: () => Layout,
    private getViewport: () => Viewport,
  ) {}

  down(id: number, x: number, y: number): ControlEvent[] {
    const events = this.up(id);
    return events.concat(this.hold(id, this.nearest(x, y)));
  }

  move(id: number, x: number, y: number): ControlEvent[] {
    const current = this.fingers.get(id);
    if (!current || !SLIDE_ACTIONS.includes(current)) return [];
    const next = this.nearest(x, y);
    if (next === current || !SLIDE_ACTIONS.includes(next)) return [];
    return this.up(id).concat(this.hold(id, next));
  }

  up(id: number): ControlEvent[] {
    const action = this.fingers.get(id);
    if (!action) return [];
    this.fingers.delete(id);
    return this.isHeld(action) ? [] : [{ type: 'release', action }];
  }

  releaseAll(): ControlEvent[] {
    const held = new Set(this.fingers.values());
    this.fingers.clear();
    return [...held].map((action) => ({ type: 'release', action }));
  }

  isHeld(action: Action): boolean {
    return [...this.fingers.values()].includes(action);
  }

  private hold(id: number, action: Action): ControlEvent[] {
    const already = this.isHeld(action);
    this.fingers.set(id, action);
    return already ? [] : [{ type: 'press', action }];
  }

  private nearest(x: number, y: number): Action {
    return nearestAction(this.getLayout(), this.getViewport(), x, y);
  }
}

/** Dragging markers in the button editor. Mutates the layout it is given. */
export class LayoutDrag {
  private drag: { id: number; action: Action; dx: number; dy: number } | null = null;

  constructor(
    private getLayout: () => Layout,
    private getViewport: () => Viewport,
  ) {}

  /** Starts dragging the marker nearest to the touch and returns it. */
  start(id: number, x: number, y: number): Action {
    const layout = this.getLayout();
    const view = this.getViewport();
    const action = nearestAction(layout, view, x, y);
    const b = layout[action];
    this.drag = { id, action, dx: x - b.x * view.width, dy: y - b.y * view.height };
    return action;
  }

  /** Moves the dragged marker, keeping it on screen. Returns false if `id` is not dragging. */
  move(id: number, x: number, y: number): boolean {
    if (!this.drag || this.drag.id !== id) return false;
    const view = this.getViewport();
    const b = this.getLayout()[this.drag.action];
    b.x = clamp01((x - this.drag.dx) / view.width);
    b.y = clamp01((y - this.drag.dy) / view.height);
    return true;
  }

  /** Ends the drag. Returns true if `id` was dragging. */
  end(id: number): boolean {
    if (!this.drag || this.drag.id !== id) return false;
    this.drag = null;
    return true;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
