// What the side panel and result screen show for each mode. DOM-free so it is unit tested.

import type { Game } from './game/game';
import type { Mode, RecordKind } from './game/modes';

/** m:ss.cc */
export function formatTime(ms: number): string {
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export function formatRecord(kind: RecordKind, value: number | null): string {
  if (value === null) return '-';
  return kind === 'time' ? formatTime(value) : String(value);
}

export type Stat = readonly [label: string, value: string];

/** Side panel stats. `game` is null on the menu (shows the selected mode's empty state). */
export function hudStats(mode: Mode, game: Game | null, best: number | null): Stat[] {
  const score = game?.score ?? 0;
  const lines = game?.lines ?? 0;
  const time = formatTime(game?.time ?? 0);
  const goal = mode.lineGoal;
  const linesText = goal === null ? String(lines) : `${lines}/${goal}`;
  switch (mode.id) {
    case 'sprint':
      return [
        ['TIME', time],
        ['BEST', formatRecord('time', best)],
        ['LINES', linesText],
        ['SCORE', String(score)],
      ];
    case 'zen':
      return [
        ['SCORE', String(score)],
        ['LINES', linesText],
        ['TIME', time],
      ];
    default: {
      // Show the live score as best once it passes the record.
      const liveBest = best === null ? (score > 0 ? score : null) : Math.max(best, score);
      return [
        ['SCORE', String(score)],
        ['BEST', formatRecord('score', liveBest)],
        ['LEVEL', String(game?.level ?? mode.level(0))],
        ['LINES', linesText],
      ];
    }
  }
}

export interface ResultText {
  title: string;
  label: string;
  value: string;
}

/** Headline of the result screen. */
export function resultText(game: Game): ResultText {
  const title = game.status === 'complete' ? 'Complete!' : 'Game Over';
  if (game.mode.record === 'time') {
    return game.status === 'complete'
      ? { title, label: 'Time', value: formatTime(game.time) }
      : { title, label: 'Lines', value: `${game.lines}/${game.mode.lineGoal}` };
  }
  return { title, label: 'Score', value: String(game.score) };
}
