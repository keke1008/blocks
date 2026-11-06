// Game modes as data: everything that differs between modes lives here, so the
// Game class has no per-mode branches beyond reading these rules.

export type ModeId = 'marathon' | 'sprint' | 'zen' | 'rising' | 'endless';

/** What a mode records as its best: higher score, lower time, or nothing. */
export type RecordKind = 'score' | 'time' | 'none';

export interface Mode {
  id: ModeId;
  name: string;
  /** One line shown on the menu. */
  summary: string;
  /** Lines needed to complete the mode; null = endless. */
  lineGoal: number | null;
  /** Level for a total number of cleared lines (also the score multiplier). */
  level(lines: number): number;
  /**
   * Milliseconds per row at a level. 0 = 20G (a piece drops to the stack the moment it
   * spawns or moves). Infinity = no gravity (soft drop still works).
   */
  gravity(level: number): number;
  /** On block out / lock out: end the game, or clear the board and keep playing. */
  topOut: 'end' | 'clear';
  /** Milliseconds between rising garbage rows at a level; null = no garbage. */
  riseInterval: ((level: number) => number) | null;
  record: RecordKind;
}

/** First level of guideline gravity that is 20G. */
export const TWENTY_G_LEVEL = 20;

/**
 * Guideline gravity: seconds per row = (0.8 - (level - 1) * 0.007) ^ (level - 1),
 * and 20G (0) from level 20. Any mode whose level reaches 20 plays at 20G.
 */
export function gravityMs(level: number): number {
  if (level >= TWENTY_G_LEVEL) return 0;
  const l = level - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

const levelEvery10 = (lines: number) => Math.floor(lines / 10) + 1;

export const MARATHON_LINES = 150;
export const SPRINT_LINES = 40;

export const MARATHON: Mode = {
  id: 'marathon',
  name: 'Marathon',
  summary: `${MARATHON_LINES} lines, speeding up every 10`,
  lineGoal: MARATHON_LINES,
  level: (lines) => Math.min(levelEvery10(lines), MARATHON_LINES / 10),
  gravity: gravityMs,
  topOut: 'end',
  riseInterval: null,
  record: 'score',
};

export const SPRINT: Mode = {
  id: 'sprint',
  name: 'Sprint',
  summary: `Clear ${SPRINT_LINES} lines as fast as you can`,
  lineGoal: SPRINT_LINES,
  level: () => 1,
  gravity: gravityMs,
  topOut: 'end',
  riseInterval: null,
  record: 'time',
};

export const ZEN: Mode = {
  id: 'zen',
  name: 'Zen',
  summary: 'No gravity, no game over',
  lineGoal: null,
  level: () => 1,
  gravity: () => Infinity,
  topOut: 'clear',
  riseInterval: null,
  record: 'none',
};

/** Rising garbage: one row every 8 s at level 1, 0.5 s sooner per level, down to 2 s. */
export function riseIntervalMs(level: number): number {
  return Math.max(2000, 8000 - (level - 1) * 500);
}

export const RISING: Mode = {
  id: 'rising',
  name: 'Rising',
  summary: 'Garbage rises from below, faster every 10 lines',
  lineGoal: null,
  level: levelEvery10,
  gravity: gravityMs,
  topOut: 'end',
  riseInterval: riseIntervalMs,
  record: 'score',
};

export const ENDLESS: Mode = {
  id: 'endless',
  name: 'Endless',
  summary: 'No line goal, no level cap: 20G from level 20',
  lineGoal: null,
  level: levelEvery10,
  gravity: gravityMs,
  topOut: 'end',
  riseInterval: null,
  record: 'score',
};

export const MODES: readonly Mode[] = [MARATHON, ENDLESS, SPRINT, ZEN, RISING];

export function modeById(id: unknown): Mode | undefined {
  return MODES.find((m) => m.id === id);
}
