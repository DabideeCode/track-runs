import { expect, test } from './fixtures';

test('a selected piece shows a visible outline', async ({ app, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await app.open();
  await app.openPlayfield();
  const { id } = await app.hook('placePiece', 'house', 8, 8, 0);
  await page.mouse.move(640, 680);
  await page.waitForTimeout(800);
  const point = await app.tilePoint(8, 8, 0.5);
  const clip = { x: point.x - 60, y: point.y - 60, width: 120, height: 120 };
  const before = await page.screenshot({ clip, path: 'test-results/shot-sel-before.png' });

  await app.clickTile(8, 8);
  expect((await app.state()).selectedPieceId).toBe(id);
  await page.mouse.move(640, 680);
  await page.waitForTimeout(800);
  const after = await page.screenshot({ clip, path: 'test-results/shot-sel-after.png' });
  expect(after.equals(before)).toBe(false);
});
