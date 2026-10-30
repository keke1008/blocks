// Guideline-style scoring.

export type TSpin = 'none' | 'mini' | 'full';

const LINE_SCORES: Record<TSpin, readonly number[]> = {
  none: [0, 100, 300, 500, 800],
  mini: [100, 200, 400],
  full: [400, 800, 1200, 1600],
};

const PERFECT_CLEAR_SCORES = [0, 800, 1200, 1800, 2000];
const B2B_QUAD_PERFECT_CLEAR = 3200;

export interface ClearInput {
  lines: number;
  tspin: TSpin;
  level: number;
  perfectClear: boolean;
  /** Back-to-back state before this lock. */
  b2b: boolean;
  /** Combo counter before this lock (-1 = no combo running). */
  combo: number;
}

export interface ClearResult {
  points: number;
  b2b: boolean;
  combo: number;
  /** True when this clear received the back-to-back bonus. */
  b2bBonus: boolean;
  labels: string[];
}

/** A "difficult" clear keeps (or starts) a back-to-back chain. */
export function isDifficult(lines: number, tspin: TSpin): boolean {
  return lines === 4 || (lines > 0 && tspin !== 'none');
}

export function scoreClear(input: ClearInput): ClearResult {
  const { lines, tspin, level, perfectClear } = input;
  let b2b = input.b2b;
  let combo = input.combo;
  let points = (LINE_SCORES[tspin][lines] ?? 0) * level;
  let b2bBonus = false;
  const labels: string[] = [];

  if (lines > 0) {
    if (isDifficult(lines, tspin)) {
      if (b2b) {
        points = Math.floor(points * 1.5);
        b2bBonus = true;
      }
      b2b = true;
    } else {
      b2b = false;
    }
    combo += 1;
    if (combo > 0) points += 50 * combo * level;
    if (perfectClear) {
      const bonus =
        lines === 4 && input.b2b ? B2B_QUAD_PERFECT_CLEAR : PERFECT_CLEAR_SCORES[lines];
      points += bonus * level;
    }
  } else {
    combo = -1;
  }

  const name = lineName(lines, tspin);
  if (name) labels.push(b2bBonus ? `B2B ${name}` : name);
  if (combo > 0) labels.push(`${combo} REN`);
  if (perfectClear && lines > 0) labels.push('PERFECT CLEAR');

  return { points, b2b, combo, b2bBonus, labels };
}

const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD'];

function lineName(lines: number, tspin: TSpin): string {
  if (tspin === 'none') return lines >= 2 ? LINE_NAMES[lines] : '';
  const prefix = tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN';
  return lines > 0 ? `${prefix} ${LINE_NAMES[lines]}` : prefix;
}
