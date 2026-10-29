export type Action = 'left' | 'right' | 'soft' | 'hard' | 'rotL' | 'rotR' | 'hold';

export const ACTIONS: readonly Action[] = ['left', 'right', 'soft', 'hard', 'rotL', 'rotR', 'hold'];

export interface ButtonLayout {
  /** Center position as a fraction of the viewport width / height. */
  x: number;
  y: number;
  /** Diameter in CSS pixels. */
  size: number;
}

export interface Settings {
  /** Delayed Auto Shift (ms). */
  das: number;
  /** Auto Repeat Rate (ms per cell). 0 = move straight to the wall. */
  arr: number;
  /** Soft drop gravity multiplier. 0 = instant (to the floor). */
  sdf: number;
  ghost: boolean;
  nextCount: number;
  buttons: Record<Action, ButtonLayout>;
}

export const SDF_OPTIONS = [5, 10, 20, 40, 0] as const;
export const MIN_BUTTON_SIZE = 40;
export const MAX_BUTTON_SIZE = 160;

export function defaultButtons(): Record<Action, ButtonLayout> {
  return {
    hard: { x: 0.13, y: 0.36, size: 72 },
    left: { x: 0.06, y: 0.6, size: 72 },
    right: { x: 0.2, y: 0.6, size: 72 },
    soft: { x: 0.13, y: 0.84, size: 72 },
    hold: { x: 0.83, y: 0.3, size: 64 },
    rotL: { x: 0.8, y: 0.68, size: 80 },
    rotR: { x: 0.92, y: 0.5, size: 80 },
  };
}

export function defaultSettings(): Settings {
  return { das: 170, arr: 50, sdf: 20, ghost: true, nextCount: 5, buttons: defaultButtons() };
}

const STORAGE_KEY = 'blocks.settings.v1';
const BEST_KEY = 'blocks.best.v1';

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  let raw: Partial<Settings> = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // Ignore unreadable storage and fall back to defaults.
  }
  const buttons = { ...d.buttons };
  for (const a of ACTIONS) {
    const b = raw.buttons?.[a];
    if (b) {
      buttons[a] = {
        x: clamp(b.x, 0, 1, d.buttons[a].x),
        y: clamp(b.y, 0, 1, d.buttons[a].y),
        size: clamp(b.size, MIN_BUTTON_SIZE, MAX_BUTTON_SIZE, d.buttons[a].size),
      };
    }
  }
  return {
    das: clamp(raw.das, 0, 500, d.das),
    arr: clamp(raw.arr, 0, 200, d.arr),
    sdf: (SDF_OPTIONS as readonly number[]).includes(raw.sdf as number) ? raw.sdf! : d.sdf,
    ghost: typeof raw.ghost === 'boolean' ? raw.ghost : d.ghost,
    nextCount: clamp(raw.nextCount, 1, 6, d.nextCount),
    buttons,
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable (private mode); settings then last for this session only.
  }
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // See saveSettings.
  }
}
