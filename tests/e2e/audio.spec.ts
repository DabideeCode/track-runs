import { expect, test } from './fixtures';

test('sounds are logged before any interaction', async ({ app }) => {
  await app.open();
  await app.hook('placePiece', 'house', 1, 1);
  expect(await app.sounds()).toEqual(['place']);
});

test('buttons log a UI click, and a palette drag does not', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  expect(await app.sounds()).toEqual(['ui']);
  await page.getByTestId('reset-view').click();
  expect(await app.sounds()).toEqual(['ui', 'ui']);
  await page.getByTestId('palette-house').click();
  expect(await app.sounds()).toEqual(['ui', 'ui', 'ui']);
  await page.keyboard.press('Escape');
  await app.dragFromPalette('car', 3, 3);
  expect(await app.sounds()).toEqual(['ui', 'ui', 'ui', 'pickup', 'place']);
});

test('each build action has its own sound', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  const { id } = await app.hook('placePiece', 'straight', 8, 8, 0);
  await app.hook('rotatePiece', id!);
  await app.hook('movePiece', id!, 4, 4);
  await app.hook('removePiece', id!);
  await app.hook('placePiece', 'straight', 16, 16);
  await page.getByTestId('reset-view').click();
  expect((await app.sounds()).slice(1)).toEqual(['place', 'rotate', 'move', 'delete', 'invalid', 'ui']);
});

test('mute and volumes persist across a reload', async ({ app, page }) => {
  await app.open();
  await page.getByTestId('music-volume').fill('20');
  await page.getByTestId('sfx-volume').fill('35');
  await page.getByTestId('mute-toggle').click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('wooden-diorama:audio')!));
  expect(stored).toEqual({ muted: true, musicVolume: 0.2, sfxVolume: 0.35 });

  await page.reload();
  await expect(page.getByTestId('music-volume')).toHaveValue('20');
  await expect(page.getByTestId('sfx-volume')).toHaveValue('35');
  await expect(page.getByTestId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('unreadable audio settings fall back to defaults', async ({ app, page }) => {
  await page.addInitScript(() => localStorage.setItem('wooden-diorama:audio', 'nope'));
  await app.open();
  await expect(page.getByTestId('music-volume')).toHaveValue('50');
  await expect(page.getByTestId('sfx-volume')).toHaveValue('80');
});
