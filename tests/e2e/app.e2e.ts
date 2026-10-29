import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { Touch, game, markerCenter, pressed, startGame } from './helpers';

test.describe('touch controls', () => {
  test('a touch far from every marker triggers the nearest one', async ({ page }) => {
    await startGame(page);
    const touch = await Touch.attach(page);
    const [, leftY] = await markerCenter(page, 'left');
    await touch.down(1, 2, leftY); // screen edge, outside the marker
    expect(await pressed(page)).toEqual(['left']);
    await touch.up(1);
    expect(await pressed(page)).toEqual([]);
  });

  test('D-pad sliding, multi-touch, and no sliding into one-shot actions', async ({ page }) => {
    await startGame(page);
    const touch = await Touch.attach(page);
    await touch.down(1, ...(await markerCenter(page, 'left')));
    await touch.move(1, ...(await markerCenter(page, 'right')));
    expect(await pressed(page)).toEqual(['right']);

    await touch.down(2, ...(await markerCenter(page, 'rotR')));
    expect((await pressed(page)).sort()).toEqual(['right', 'rotR']);

    await touch.move(1, ...(await markerCenter(page, 'hard')));
    expect((await pressed(page)).sort()).toEqual(['right', 'rotR']);

    await touch.up(1);
    await touch.up(2);
    expect(await pressed(page)).toEqual([]);
  });

  test('holding left slides the piece to the wall; hard drop locks it', async ({ page }) => {
    await startGame(page);
    const touch = await Touch.attach(page);
    await touch.down(1, ...(await markerCenter(page, 'left')));
    await page.waitForTimeout(600);
    await touch.up(1);
    expect(await game(page, (g) => g.collides(g.active!.type, g.active!.rot, g.active!.x - 1, g.active!.y))).toBe(true);

    await touch.down(1, ...(await markerCenter(page, 'hard')));
    await touch.up(1);
    expect(await game(page, (g) => g.pieceCount)).toBe(2);
    expect(await game(page, (g) => g.score)).toBeGreaterThan(0);
  });

  test('touchstart is cancelled so Android long-press haptics never start', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => {
      window.addEventListener('touchstart', (e) => ((window as unknown as { tsPrevented: boolean }).tsPrevented = e.defaultPrevented));
    });
    const touch = await Touch.attach(page);
    await touch.down(1, ...(await markerCenter(page, 'soft')));
    expect(await page.evaluate(() => (window as unknown as { tsPrevented: boolean }).tsPrevented)).toBe(true);
    await touch.up(1);
  });
});

test.describe('screens', () => {
  test('pause button and auto-pause when hidden', async ({ page }) => {
    await startGame(page);
    await page.locator('#pause-btn').tap();
    await expect(page.locator('#pause')).toBeVisible();
    await page.locator('#pause [data-action=resume]').tap();
    await expect(page.locator('#pause')).toBeHidden();

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#pause')).toBeVisible();
  });

  test('portrait shows the rotate screen and pauses', async ({ page }) => {
    await startGame(page);
    // Start requests fullscreen; the test browser cannot resize a fullscreen window.
    await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
    await page.setViewportSize({ width: 393, height: 851 });
    await expect(page.locator('#rotate')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__blocks.screen())).toBe('paused');
  });

  test('settings persist across reloads', async ({ page }) => {
    await page.goto('./?e2e');
    await page.locator('#menu [data-action=settings]').tap();
    await page.locator('#set-das').fill('120');
    await page.locator('#set-ghost').uncheck();
    await page.reload();
    await page.locator('#menu [data-action=settings]').tap();
    await expect(page.locator('#out-das')).toHaveText('120ms');
    await expect(page.locator('#set-ghost')).not.toBeChecked();
  });

  test('button editor moves a marker and keeps it', async ({ page }) => {
    await page.goto('./?e2e');
    await page.locator('#menu [data-action=settings]').tap();
    await page.locator('[data-action=layout]').tap();
    const [x, y] = await markerCenter(page, 'hold');
    const touch = await Touch.attach(page);
    await touch.down(1, x, y);
    await touch.move(1, x - 60, y + 40);
    await touch.up(1);
    await page.reload();
    const [nx, ny] = await markerCenter(page, 'hold');
    expect(nx).toBeCloseTo(x - 60, 0);
    expect(ny).toBeCloseTo(y + 40, 0);
  });
});

test.describe('updates', () => {
  const swPath = 'dist/sw.js';
  let original = '';
  test.beforeEach(() => {
    original = readFileSync(swPath, 'utf8');
  });
  test.afterEach(() => {
    writeFileSync(swPath, original);
  });

  test('a new release shows the banner outside play and reloads into it', async ({ page }) => {
    await page.goto('./?e2e');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await expect(page.locator('#update')).toBeHidden();

    await page.locator('#menu [data-action=start]').tap();
    // Ship a "new release": a service worker with a different version.
    writeFileSync(swPath, original.replace(/const VERSION = '[^']+'/, "const VERSION = 'e2e-next'"));
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());

    await page.waitForTimeout(1000);
    await expect(page.locator('#update')).toBeHidden(); // never during play
    await page.locator('#pause-btn').tap();
    await expect(page.locator('#update')).toBeVisible();

    await page.locator('#update button').tap();
    await page.waitForLoadState('load');
    await expect(page.locator('#update')).toBeHidden();
    expect(await page.evaluate(() => caches.keys())).toEqual(['blocks-e2e-next']);
  });
});
