import { expect, test } from './fixtures';

test('undo and redo cover at least 20 steps', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  for (let i = 0; i < 25; i += 1) await app.hook('placePiece', 'house', i % 16, Math.floor(i / 16));
  await page.locator('canvas').hover();
  for (let i = 0; i < 20; i += 1) await page.keyboard.press('Control+z');
  expect((await app.state()).pieces).toHaveLength(5);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Control+Shift+z');
  expect((await app.state()).pieces).toHaveLength(8);
});

test('undo covers move, rotate and delete', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  const { id } = await app.hook('placePiece', 'house', 1, 1, 0);
  await app.hook('movePiece', id!, 2, 2);
  await app.hook('rotatePiece', id!);
  await app.hook('removePiece', id!);
  await page.keyboard.press('Control+z');
  expect((await app.state()).pieces[0]).toMatchObject({ gridX: 2, gridZ: 2, rotation: 90 });
  await page.keyboard.press('Control+z');
  expect((await app.state()).pieces[0]).toMatchObject({ rotation: 0 });
  await page.keyboard.press('Control+z');
  expect((await app.state()).pieces[0]).toMatchObject({ gridX: 1, gridZ: 1 });
});

test('undo does nothing in Play', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'station', 1, 1, 0);
  await app.hook('setMode', 'play');
  await page.keyboard.press('Control+z');
  expect((await app.state()).pieces).toHaveLength(1);
});

test('unsaved changes autosave after 30 seconds', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'house', 1, 1);
  await expect(page.getByTestId('toast')).toContainText('Autosaved', { timeout: 35_000 });
  expect((await app.state()).isDirty).toBe(false);
  expect((await app.state()).dioramaId).not.toBeNull();
});

test('Low quality can be switched on and off', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  const toggle = page.getByRole('button', { name: 'Low quality' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('a save captures a thumbnail for the menu', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'house', 8, 8);
  await page.waitForTimeout(400);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('back-to-menu').click();
  await expect(page.getByTestId('diorama-item').locator('img')).toHaveAttribute('src', /^data:image\/jpeg/);
});
