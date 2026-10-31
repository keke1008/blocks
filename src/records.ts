// Best results per mode, kept on the device.

import type { Game } from './game/game';
import type { Mode, RecordKind } from './game/modes';

/** The value a finished game puts on the records, or null if it does not count. */
export function resultValue(game: Game): number | null {
  switch (game.mode.record) {
    case 'score':
      return game.score;
    case 'time':
      // A time only counts when the goal was reached.
      return game.status === 'complete' ? game.time : null;
    case 'none':
      return null;
  }
}

export function isBetter(kind: RecordKind, value: number, best: number | null): boolean {
  if (kind === 'none') return false;
  if (best === null) return kind === 'time' || value > 0;
  return kind === 'time' ? value < best : value > best;
}

/** Marathon keeps the key from before modes existed, so old bests carry over. */
function key(mode: Mode): string {
  return mode.id === 'marathon' ? 'blocks.best.v1' : `blocks.best.${mode.id}.v1`;
}

export function loadRecord(mode: Mode): number | null {
  if (mode.record === 'none') return null;
  try {
    const v = Number(localStorage.getItem(key(mode)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveRecord(mode: Mode, value: number): void {
  try {
    localStorage.setItem(key(mode), String(value));
  } catch {
    // Storage may be unavailable (private mode); the record then lasts for this session only.
  }
}

const MODE_KEY = 'blocks.mode.v1';

export function loadModeId(): string | null {
  try {
    return localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

export function saveModeId(id: string): void {
  try {
    localStorage.setItem(MODE_KEY, id);
  } catch {
    // See saveRecord.
  }
}
