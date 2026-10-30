import { expect, test } from './fixtures';

test('opens to the menu and reaches a working playfield', async ({ app, page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await app.open();
  await expect(page).toHaveTitle('Track');
  await expect(page.getByRole('heading', { name: 'Track' })).toBeVisible();
  await app.openPlayfield();

  const tracks: Array<[string, number, number, 0 | 90 | 180 | 270]> = [
    ['station', 6, 8, 0], ['straight', 6, 7, 0], ['curve', 6, 6, 0], ['straight', 7, 6, 90],
    ['curve', 8, 6, 90], ['straight', 8, 7, 0], ['straight', 8, 8, 0], ['curve', 8, 9, 180],
    ['straight', 7, 9, 90], ['curve', 6, 9, 270],
  ];
  for (const [type, x, z, rotation] of tracks) {
    expect((await app.hook('placePiece', type as never, x, z, rotation)).ok).toBe(true);
  }
  const decorations: Array<[string, number, number]> = [
    ['house', 10, 5], ['pineTree', 11, 7], ['roundTree', 4, 5], ['hill', 3, 9],
    ['car', 10, 9], ['cassette', 11, 11], ['blocks', 5, 11], ['tunnel', 2, 6], ['buffer', 12, 4],
  ];
  for (const [type, x, z] of decorations) {
    expect((await app.hook('placePiece', type as never, x, z)).ok).toBe(true);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/shot-built.png' });

  await page.mouse.move(960, 540);
  await page.mouse.wheel(0, -1100);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/shot-close.png' });
  await page.getByTestId('reset-view').click();

  await page.getByTestId('setting-select').selectOption('kitchen');
  await app.clickTile(10, 5);
  await page.mouse.move(1500, 800);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/shot-kitchen.png' });

  const house = await app.tilePoint(10, 5);
  await page.mouse.click(house.x, house.y);
  await page.mouse.move(house.x + 180, house.y + 140);
  await page.mouse.wheel(0, -700);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/shot-outline.png' });
  expect((await app.state()).selectedPieceId).not.toBeNull();
  await page.getByTestId('reset-view').click();
  await page.waitForTimeout(1000);

  await app.hook('setMode', 'play');
  await page.waitForTimeout(1800);
  expect((await app.hook('getTrain'))?.moving).toBe(true);
});
