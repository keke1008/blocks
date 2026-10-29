import { BUFFER_HEIGHT, VISIBLE_HEIGHT, WIDTH, type Game } from './game/game';
import { PIECE_COLORS, pieceCells, type PieceType } from './game/pieces';

const LABEL_MS = 1500;

/** Board + hold + next drawn on a single full-screen canvas, centered. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cell = 16;
  private ox = 0;
  private oy = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Layout in cells: hold panel (5) + gap + board (10) + gap + next panel (5).
    this.cell = Math.max(8, Math.floor(Math.min((h - 16) / VISIBLE_HEIGHT, w / 22)));
    this.ox = Math.round((w - WIDTH * this.cell) / 2);
    this.oy = Math.round((h - VISIBLE_HEIGHT * this.cell) / 2);
  }

  draw(game: Game | null, opts: { ghost: boolean; nextCount: number; best: number }): void {
    const { ctx, cell, ox, oy } = this;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Playfield background and grid.
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(ox, oy, WIDTH * cell, VISIBLE_HEIGHT * cell);
    ctx.strokeStyle = '#1c2330';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < WIDTH; x++) {
      ctx.moveTo(ox + x * cell + 0.5, oy);
      ctx.lineTo(ox + x * cell + 0.5, oy + VISIBLE_HEIGHT * cell);
    }
    for (let y = 1; y < VISIBLE_HEIGHT; y++) {
      ctx.moveTo(ox, oy + y * cell + 0.5);
      ctx.lineTo(ox + WIDTH * cell, oy + y * cell + 0.5);
    }
    ctx.stroke();
    ctx.strokeStyle = '#6b7689';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 1, oy - 1, WIDTH * cell + 2, VISIBLE_HEIGHT * cell + 2);

    this.drawPanels(game, opts);
    if (!game) return;

    // Locked blocks. The row just above the field is drawn partially so
    // pieces stacked into the buffer are still visible.
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy - cell, WIDTH * cell, (VISIBLE_HEIGHT + 1) * cell);
    ctx.clip();
    for (let y = BUFFER_HEIGHT - 1; y < game.board.length; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const c = game.board[y][x];
        if (c) this.block(ox + x * cell, oy + (y - BUFFER_HEIGHT) * cell, cell, PIECE_COLORS[c]);
      }
    }

    const p = game.active;
    if (p && game.status === 'playing') {
      if (opts.ghost) {
        const gy = game.ghostY();
        for (const [cx, cy] of pieceCells(p.type, p.rot)) {
          this.ghost(ox + (p.x + cx) * cell, oy + (gy + cy - BUFFER_HEIGHT) * cell, cell, PIECE_COLORS[p.type]);
        }
      }
      for (const [cx, cy] of pieceCells(p.type, p.rot)) {
        this.block(ox + (p.x + cx) * cell, oy + (p.y + cy - BUFFER_HEIGHT) * cell, cell, PIECE_COLORS[p.type]);
      }
    }
    ctx.restore();
  }

  private drawPanels(game: Game | null, opts: { nextCount: number; best: number }): void {
    const { ctx, cell, ox, oy } = this;
    const leftX = ox - cell * 5.5;
    const rightX = ox + WIDTH * cell + cell * 0.5;
    const small = Math.max(10, Math.round(cell * 0.7));
    const big = Math.max(12, Math.round(cell * 0.95));

    ctx.fillStyle = '#8b95a7';
    ctx.font = `600 ${small}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('HOLD', leftX, oy);
    ctx.fillText('NEXT', rightX, oy);

    if (game) {
      if (game.hold) {
        this.preview(game.hold, leftX, oy + cell * 1.2, cell, game.holdUsed ? 0.35 : 1);
      }
      for (let i = 0; i < Math.min(opts.nextCount, game.queue.length); i++) {
        const size = i === 0 ? cell : cell * 0.75;
        const y = i === 0 ? oy + cell * 1.2 : oy + cell * (4.2 + (i - 1) * 2.6);
        this.preview(game.queue[i], rightX, y, size, 1);
      }
    }

    // Stats under the hold box.
    const stats: [string, string][] = [
      ['SCORE', String(game?.score ?? 0)],
      ['BEST', String(Math.max(opts.best, game?.score ?? 0))],
      ['LEVEL', String(game?.level ?? 1)],
      ['LINES', String(game?.lines ?? 0)],
    ];
    let y = oy + cell * 5;
    for (const [label, value] of stats) {
      ctx.fillStyle = '#8b95a7';
      ctx.font = `600 ${small}px system-ui, sans-serif`;
      ctx.fillText(label, leftX, y);
      ctx.fillStyle = '#e6edf3';
      ctx.font = `700 ${big}px system-ui, sans-serif`;
      ctx.fillText(value, leftX, y + small + 2);
      y += small + big + cell * 0.6;
    }

    // Last clear labels (fade out).
    const ev = game?.lastClear;
    if (game && ev && game.time - ev.at < LABEL_MS) {
      const alpha = 1 - (game.time - ev.at) / LABEL_MS;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#f0c674';
      ctx.font = `700 ${small}px system-ui, sans-serif`;
      let ly = y + cell * 0.4;
      for (const label of ev.labels) {
        ctx.fillText(label, leftX, ly);
        ly += small + 4;
      }
      ctx.fillStyle = '#e6edf3';
      ctx.fillText(`+${ev.points}`, leftX, ly);
      ctx.globalAlpha = 1;
    }
  }

  /** Draws a piece inside a 4x2-cell preview box at (x, y). */
  private preview(type: PieceType, x: number, y: number, size: number, alpha: number): void {
    const cells = pieceCells(type, 0);
    const xs = cells.map(([cx]) => cx);
    const ys = cells.map(([, cy]) => cy);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX + 1;
    const h = Math.max(...ys) - minY + 1;
    const offX = x + ((4 - w) * size) / 2;
    const offY = y + ((2 - h) * size) / 2;
    this.ctx.globalAlpha = alpha;
    for (const [cx, cy] of cells) {
      this.block(offX + (cx - minX) * size, offY + (cy - minY) * size, size, PIECE_COLORS[type]);
    }
    this.ctx.globalAlpha = 1;
  }

  private block(x: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 1, y + 1, size - 2, Math.max(2, size * 0.18));
  }

  private ghost(x: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
    ctx.globalAlpha = 1;
  }
}
