import { expect, test } from '@playwright/test';
import { game, startGame } from './helpers';

test.describe('modes', () => {
  test('the chosen mode is used, kept on restart and remembered after reload', async ({ page }) => {
    await page.goto('./?e2e');
    await expect(page.locator('#modes [data-mode=marathon]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#modes [data-mode=sprint]').tap();
    await expect(page.locator('#modes [data-mode=sprint]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#menu-summary')).toContainText('40 lines');

    await page.locator('#menu [data-action=start]').tap();
    await page.waitForFunction(() => window.__blocks.screen() === 'playing');
    expect(await game(page, (g) => g.mode.id)).toBe('sprint');

    await page.locator('#pause-btn').tap();
    await page.locator('#pause [data-action=restart]').tap();
    expect(await game(page, (g) => g.mode.id)).toBe('sprint');

    await page.reload();
    await expect(page.locator('#modes [data-mode=sprint]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('each mode shows its own best; Zen has none', async ({ page }) => {
    await page.goto('./?e2e');
    await page.evaluate(() => {
      localStorage.setItem('blocks.best.v1', '4321');
      localStorage.setItem('blocks.best.sprint.v1', '61230');
    });
    await page.reload();
    await expect(page.locator('#menu-best')).toHaveText('4321');
    await page.locator('#modes [data-mode=sprint]').tap();
    await expect(page.locator('#menu-best')).toHaveText('1:01.23');
    await page.locator('#modes [data-mode=rising]').tap();
    await expect(page.locator('#menu-best')).toHaveText('-');
    await page.locator('#modes [data-mode=zen]').tap();
    await expect(page.locator('#menu-best-row')).toBeHidden();
  });

  test('a finished sprint shows the time and saves it as the best', async ({ page }) => {
    await startGame(page, 'sprint');
    // Finish the run through the game state; the rules themselves are unit tested.
    await game(page, (g) => {
      g.lines = 40;
      g.time = 61230;
      g.status = 'complete';
    });
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#over-title')).toHaveText('Complete!');
    await expect(page.locator('#over-label')).toHaveText('Time');
    await expect(page.locator('#over-score')).toHaveText('1:01.23');
    await expect(page.locator('#over-best')).toHaveText('New best!');
    expect(await page.evaluate(() => localStorage.getItem('blocks.best.sprint.v1'))).toBe('61230');
  });

  test('pieces do not fall in zen', async ({ page }) => {
    await startGame(page, 'zen');
    const y = await game(page, (g) => g.active!.y);
    await page.waitForTimeout(1500);
    expect(await game(page, (g) => g.active!.y)).toBe(y);
  });
});
