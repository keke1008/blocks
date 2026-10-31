// Best results per mode, kept on the device.

import type { Game } from './game/game';
import type { Mode, RecordKind } from './game/modes';
import { readItem, writeItem } from './storage';

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
  const v = Number(readItem(key(mode)));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function saveRecord(mode: Mode, value: number): void {
  writeItem(key(mode), String(value));
}

/** The last chosen mode. Kept apart from Settings so "Reset" there does not change it. */
const MODE_KEY = 'blocks.mode.v1';

export function loadModeId(): string | null {
  return readItem(MODE_KEY);
}

export function saveModeId(id: string): void {
  writeItem(MODE_KEY, id);
}
