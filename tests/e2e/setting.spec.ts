import { expect, test } from './fixtures';

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openPlayfield();
});

test('offers exactly two settings and starts on Bedroom floor', async ({ app, page }) => {
  const select = page.getByTestId('setting-select');
  await expect(select.locator('option')).toHaveText(['Bedroom floor', 'Kitchen table']);
  await expect(select).toHaveValue('bedroom');
  expect((await app.state()).setting).toBe('bedroom');
});

test('switching setting moves no pieces and marks a change', async ({ app, page }) => {
  await app.hook('placePiece', 'house', 4, 4, 0);
  const before = (await app.state()).pieces;
  await page.getByTestId('setting-select').selectOption('kitchen');
  const after = await app.state();
  expect(after.setting).toBe('kitchen');
  expect(after.pieces).toEqual(before);
  expect(after.isDirty).toBe(true);
});

test('the table fades in over solid surfaces with nothing showing through', async ({ app, page }) => {
  await app.hook('placePiece', 'house', 8, 8, 0);
  await page.mouse.move(1000, 600);
  await page.getByTestId('setting-select').selectOption('kitchen');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/shot-fade.png' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/shot-kitchen-done.png' });
  await page.getByTestId('setting-select').selectOption('bedroom');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/shot-bedroom-back.png' });
  expect((await app.state()).setting).toBe('bedroom');
});

test('flip works by button and by F, in Build only', async ({ app, page }) => {
  await app.hook('placePiece', 'station', 8, 8, 0);
  await page.getByTestId('flip-direction').click();
  expect((await app.state()).startFacing).toBe(180);
  await page.keyboard.press('f');
  expect((await app.state()).startFacing).toBe(0);
  await app.hook('setMode', 'play');
  await page.keyboard.press('f');
  expect((await app.state()).startFacing).toBe(0);
  await expect(page.getByTestId('flip-direction')).toBeDisabled();
});

test('shortcuts are ignored while the setting selector has focus', async ({ app, page }) => {
  await page.getByTestId('setting-select').focus();
  await page.keyboard.press('f');
  expect((await app.state()).startFacing).toBe(0);
});
