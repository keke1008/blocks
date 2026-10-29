import { Game, type GameOptions } from '../src/game/game';
import { InputController } from '../src/input';
import { defaultSettings, type Action, type Settings } from '../src/settings';

/** Deterministic RNG (LCG) so bags and fuzz runs are reproducible. */
export function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export type ScriptStep = { at: number } & ({ press: Action } | { release: Action });

export interface Frame {
  /** Game time at the end of this frame (ms). */
  t: number;
  dt: number;
}

/**
 * Plays a timed input script through the real InputController and Game,
 * stepping frame by frame like the browser loop does.
 */
export class Replay {
  readonly game: Game;
  readonly input: InputController;
  settings: Settings;
  t = 0;

  constructor(options: GameOptions = {}, settings: Partial<Settings> = {}) {
    this.settings = { ...defaultSettings(), ...settings };
    this.game = new Game({ rng: seeded(1), ...options });
    this.input = new InputController(() => this.game, () => this.settings);
    this.syncSettings();
  }

  syncSettings(): void {
    this.game.setSoftDropFactor(this.settings.sdf === 0 ? Infinity : this.settings.sdf);
  }

  press(action: Action): this {
    this.input.press(action);
    return this;
  }

  release(action: Action): this {
    this.input.release(action);
    return this;
  }

  /** Advances by `ms` in frames of `frame` ms. `onFrame` runs after each frame. */
  advance(ms: number, frame = 16, onFrame?: (f: Frame) => void): this {
    let left = ms;
    while (left > 0 && this.game.status === 'playing') {
      const dt = Math.min(frame, left);
      this.step(dt);
      onFrame?.({ t: this.t, dt });
      left -= dt;
    }
    return this;
  }

  /** One browser frame: input repeat first, then the game, as in main.ts. */
  step(dt: number): void {
    this.input.update(dt);
    this.game.update(dt);
    this.t += dt;
  }

  /** Runs a script of presses/releases at given times, then `tail` ms more. */
  run(script: ScriptStep[], tail = 0, frame = 16): this {
    const steps = [...script].sort((a, b) => a.at - b.at);
    for (const s of steps) {
      if (s.at > this.t) this.advance(s.at - this.t, frame);
      if ('press' in s) this.press(s.press);
      else this.release(s.release);
    }
    return this.advance(tail, frame);
  }
}
