import type { Game } from './game/game';
import type { Action, Settings } from './settings';

/**
 * Turns button presses into game actions, including DAS/ARR auto-repeat
 * for left/right and held soft drop.
 */
export class InputController {
  private held = new Set<Action>();
  /** Horizontal direction currently auto-repeating (last pressed wins). */
  private dir: -1 | 0 | 1 = 0;
  private dasTimer = 0;
  private arrTimer = 0;

  constructor(
    private getGame: () => Game | null,
    private getSettings: () => Settings,
  ) {}

  press(action: Action): void {
    if (this.held.has(action)) return;
    this.held.add(action);
    const game = this.getGame();
    if (!game || game.status !== 'playing') return;
    switch (action) {
      case 'left':
      case 'right':
        this.startShift(action === 'left' ? -1 : 1);
        break;
      case 'soft':
        game.setSoftDrop(true);
        break;
      case 'hard':
        game.hardDrop();
        break;
      case 'rotL':
        game.rotate(-1);
        break;
      case 'rotR':
        game.rotate(1);
        break;
      case 'hold':
        game.holdPiece();
        break;
    }
  }

  release(action: Action): void {
    if (!this.held.delete(action)) return;
    const game = this.getGame();
    if (action === 'soft' && game) game.setSoftDrop(false);
    if ((action === 'left' && this.dir === -1) || (action === 'right' && this.dir === 1)) {
      // Fall back to the other direction if it is still held.
      const other = action === 'left' ? 'right' : 'left';
      if (this.held.has(other)) this.startShift(other === 'left' ? -1 : 1);
      else this.dir = 0;
    }
  }

  releaseAll(): void {
    for (const a of [...this.held]) this.release(a);
  }

  update(dt: number): void {
    const game = this.getGame();
    if (!game || game.status !== 'playing' || this.dir === 0) return;
    const { das, arr } = this.getSettings();
    const before = this.dasTimer;
    this.dasTimer += dt;
    if (this.dasTimer < das) return;
    if (arr === 0) {
      while (this.step(game)) {
        // Slide to the wall.
      }
      return;
    }
    // Time past the DAS threshold is spent on repeats.
    this.arrTimer += before < das ? this.dasTimer - das : dt;
    while (this.arrTimer >= arr) {
      this.arrTimer -= arr;
      if (!this.step(game)) {
        this.arrTimer = 0;
        break;
      }
    }
  }

  private startShift(dir: -1 | 1): void {
    this.dir = dir;
    this.dasTimer = 0;
    this.arrTimer = 0;
    const game = this.getGame();
    if (game) this.step(game);
  }

  private step(game: Game): boolean {
    return this.dir === -1 ? game.moveLeft() : game.moveRight();
  }
}
