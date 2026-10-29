import type { CDPSession, Page } from '@playwright/test';
import type { Game } from '../../src/game/game';
import type { Action } from '../../src/settings';

declare global {
  interface Window {
    __blocks: { game: () => Game | null; screen: () => string };
  }
}

/** Opens the app with the test hook enabled and starts a game. */
export async function startGame(page: Page): Promise<void> {
  await page.goto('./?e2e');
  await page.locator('#menu [data-action=start]').tap();
  await page.waitForFunction(() => window.__blocks.screen() === 'playing');
}

/** Real multi-touch through the Chrome DevTools protocol. */
export class Touch {
  private points = new Map<number, { x: number; y: number }>();

  private constructor(private cdp: CDPSession) {}

  static async attach(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page));
  }

  async down(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.send('touchStart');
  }

  async move(id: number, x: number, y: number): Promise<void> {
    this.points.set(id, { x, y });
    await this.send('touchMove');
  }

  async up(id: number): Promise<void> {
    this.points.delete(id);
    await this.send('touchEnd');
  }

  private send(type: 'touchStart' | 'touchMove' | 'touchEnd'): Promise<unknown> {
    const touchPoints = [...this.points].map(([id, p]) => ({ id, ...p }));
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
}

/** Actions whose markers are currently shown pressed. */
export function pressed(page: Page): Promise<Action[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#controls .ctl.down')].map(
      (el) => el.dataset.control as Action,
    ),
  );
}

/** Center of an action's marker in CSS pixels. */
export async function markerCenter(page: Page, action: Action): Promise<[number, number]> {
  const box = (await page.locator(`[data-control=${action}]`).boundingBox())!;
  return [box.x + box.width / 2, box.y + box.height / 2];
}

export function game<T>(page: Page, read: (g: Game) => T): Promise<T> {
  return page.evaluate(`(${read.toString()})(window.__blocks.game())`) as Promise<T>;
}
