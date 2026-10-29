import { PIECE_TYPES, type PieceType } from './pieces';

export type Rng = () => number;

/** 7-bag randomizer: every run of 7 pieces contains each piece exactly once. */
export class Bag {
  private pool: PieceType[] = [];

  constructor(private readonly rng: Rng = Math.random) {}

  next(): PieceType {
    if (this.pool.length === 0) this.refill();
    return this.pool.pop()!;
  }

  private refill(): void {
    const pieces = [...PIECE_TYPES];
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    this.pool = pieces;
  }
}
