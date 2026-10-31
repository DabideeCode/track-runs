import { expect, test } from '@playwright/test';
import { clickTile, dragFromPalette, dragTile, gameState, hook, openApp, place } from './helpers/app';

const DECORATIONS = [
  ['house', 9, 2],
  ['pineTree', 10, 2],
  ['roundTree', 11, 2],
  ['hill', 9, 4],
  ['car', 12, 4],
  ['cassette', 12, 5],
  ['blocks', 13, 4],
] as const;

test('a full session runs without a console error', async ({ page }) => {
  test.setTimeout(90_000);
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await openApp(page);
  await page.getByTestId('new-diorama').click();
  await expect(page.getByTestId('playfield')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');

  // Every track type, in a line ending at a buffer.
  await dragFromPalette(page, 'station', 5, 9);
  await place(page, 'straight', 5, 8, 0);
  await place(page, 'tunnel', 5, 7, 0);
  await place(page, 'buffer', 5, 6, 0);
  await place(page, 'curve', 5, 10, 270);
  await place(page, 'straight', 6, 10, 90);

  // Every decoration.
  for (const [type, x, z] of DECORATIONS) await place(page, type, x, z);
  await clickTile(page, 9, 2);
  await page.keyboard.press('r');
  await dragTile(page, [10, 2], [10, 1]);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');

  // Both settings, then play.
  await page.getByTestId('setting-select').selectOption('kitchen');
  await page.waitForTimeout(800);
  await page.getByTestId('setting-select').selectOption('bedroom');
  await page.waitForTimeout(800);
  await page.getByTestId('setting-select').selectOption('kitchen');
  await page.getByTestId('flip-direction').click();

  await page.getByTestId('mode-toggle').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('drive-toggle').click();
  await page.keyboard.down('w');
  await page.waitForTimeout(600);
  await page.keyboard.up('w');
  await page.getByTestId('low-quality-toggle').click();
  await page.waitForTimeout(400);
  await page.getByTestId('low-quality-toggle').click();
  await page.getByTestId('mode-toggle').click();

  const saved = await gameState(page);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('back-to-menu').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('diorama-item').locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);

  await page.reload();
  await page.getByTestId('diorama-open').click();
  await expect(page.getByTestId('playfield')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
  const reopened = await gameState(page);
  expect(reopened.pieces).toEqual(saved.pieces);
  expect(reopened.setting).toBe('kitchen');
  expect(reopened.startFacing).toBe(180);
  expect(new Set(reopened.pieces.map((piece) => piece.type)).size).toBe(12);
  expect(await hook(page, (h) => h.setMode('play'))).toEqual({ ok: true });
  await page.waitForTimeout(600);

  expect(problems).toEqual([]);
});
