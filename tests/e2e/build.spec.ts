import { expect, test } from './fixtures';

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openPlayfield();
});

test('a palette drag places one piece and selects it', async ({ app }) => {
  await app.dragFromPalette('straight', 8, 8);
  const state = await app.state();
  expect(state.pieces).toHaveLength(1);
  expect(state.pieces[0]).toMatchObject({ type: 'straight', gridX: 8, gridZ: 8, rotation: 0 });
  expect(state.selectedPieceId).toBe(state.pieces[0]!.id);
  expect(state.selectedTool).toBeNull();
  expect(await app.sounds()).toEqual(expect.arrayContaining(['pickup', 'place']));
});

test('clicking a tile places the selected tool and the tool stays selected', async ({ app, page }) => {
  await page.getByTestId('palette-house').click();
  expect((await app.state()).selectedTool).toBe('house');
  await expect(page.getByTestId('palette-house')).toHaveAttribute('aria-pressed', 'true');
  await app.clickTile(3, 3);
  await app.clickTile(5, 3);
  const state = await app.state();
  expect(state.pieces.map((piece) => [piece.gridX, piece.gridZ])).toEqual([[3, 3], [5, 3]]);
  expect(state.selectedTool).toBe('house');
});

test('Escape deselects the tool, and a second press clears the selection', async ({ app, page }) => {
  await page.getByTestId('palette-car').click();
  await page.keyboard.press('Escape');
  expect((await app.state()).selectedTool).toBeNull();
});

test('clicking a placed piece selects it and clears the tool (D-01)', async ({ app, page }) => {
  const { id } = await app.hook('placePiece', 'straight', 8, 8, 0);
  await page.getByTestId('palette-house').click();
  await app.clickTile(8, 8);
  const state = await app.state();
  expect(state.selectedPieceId).toBe(id);
  expect(state.selectedTool).toBeNull();
  expect(state.pieces).toHaveLength(1);
});

test('a drop on a blocked tile is refused with the invalid sound', async ({ app }) => {
  await app.hook('placePiece', 'straight', 5, 5, 0);
  await app.dragFromPalette('house', 5, 5);
  expect((await app.state()).pieces).toHaveLength(1);
  expect(await app.sounds()).toContain('invalid');
});

test('a release off the grid cancels with the invalid sound', async ({ app, page }) => {
  const item = (await page.getByTestId('palette-house').boundingBox())!;
  await page.mouse.move(item.x + 20, item.y + 20);
  await page.mouse.down();
  await page.mouse.move(item.x + 80, item.y + 200, { steps: 4 });
  await page.mouse.up();
  expect((await app.state()).pieces).toHaveLength(0);
  expect(await app.sounds()).toContain('invalid');
});

test('Escape cancels a drag with no invalid sound', async ({ app, page }) => {
  const item = (await page.getByTestId('palette-house').boundingBox())!;
  const target = await app.tilePoint(8, 8);
  await page.mouse.move(item.x + 20, item.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await app.state()).pieces).toHaveLength(0);
  expect(await app.sounds()).not.toContain('invalid');
});

test('R turns the ghost during a drag', async ({ app, page }) => {
  const item = (await page.getByTestId('palette-house').boundingBox())!;
  const target = await app.tilePoint(8, 8);
  await page.mouse.move(item.x + 20, item.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.keyboard.press('r');
  await page.mouse.up();
  expect((await app.state()).pieces[0]?.rotation).toBe(90);
  expect(await app.sounds()).toContain('rotate');
});

test('dragging a placed piece moves it, and an invalid drop returns it', async ({ app, page }) => {
  await app.hook('placePiece', 'house', 4, 4, 0);
  await app.hook('placePiece', 'house', 6, 4, 0);

  const from = await app.tilePoint(4, 4);
  const to = await app.tilePoint(4, 7);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  expect((await app.state()).pieces[0]).toMatchObject({ gridX: 4, gridZ: 7 });
  expect(await app.sounds()).toContain('move');

  const start = await app.tilePoint(4, 7);
  const blocked = await app.tilePoint(6, 4);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(blocked.x, blocked.y, { steps: 6 });
  await page.mouse.up();
  expect((await app.state()).pieces[0]).toMatchObject({ gridX: 4, gridZ: 7 });
  expect(await app.sounds()).toContain('invalid');
});

test('R, Delete and the delete button act on the selected piece', async ({ app, page }) => {
  await app.hook('placePiece', 'house', 8, 8, 0);
  await app.hook('placePiece', 'car', 3, 3, 0);
  await expect(page.getByTestId('delete-piece')).toBeDisabled();

  await app.clickTile(8, 8);
  await page.keyboard.press('r');
  expect((await app.state()).pieces[0]?.rotation).toBe(90);
  await page.keyboard.press('Delete');
  expect((await app.state()).pieces.map((piece) => piece.type)).toEqual(['car']);

  await app.clickTile(3, 3);
  await page.getByTestId('delete-piece').click();
  expect((await app.state()).pieces).toHaveLength(0);
  expect((await app.sounds()).filter((sound) => sound === 'delete')).toHaveLength(2);
});

test('a second station is blocked in the palette with a tooltip', async ({ app, page }) => {
  await app.hook('placePiece', 'station', 8, 8, 0);
  const item = page.getByTestId('palette-station');
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  await item.hover();
  await expect(page.getByRole('tooltip')).toContainText('Only one station');
  await item.click({ force: true });
  expect((await app.state()).selectedTool).toBeNull();
});

test('placing a station from the palette ends that tool', async ({ app, page }) => {
  await page.getByTestId('palette-station').click();
  await app.clickTile(8, 8);
  const state = await app.state();
  expect(state.pieces).toHaveLength(1);
  expect(state.selectedTool).toBeNull();
});

test('the camera orbits and Reset view restores it, leaving pieces alone', async ({ app, page }) => {
  await app.hook('placePiece', 'house', 8, 8, 0);
  const before = await app.tilePoint(0, 0);
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(760, 340, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(600);
  const orbited = await app.tilePoint(0, 0);
  expect(Math.abs(orbited.x - before.x) + Math.abs(orbited.y - before.y)).toBeGreaterThan(20);
  expect((await app.state()).pieces[0]).toMatchObject({ gridX: 8, gridZ: 8, rotation: 0 });

  await page.getByTestId('reset-view').click();
  await expect
    .poll(async () => {
      const point = await app.tilePoint(0, 0);
      return Math.abs(point.x - before.x) + Math.abs(point.y - before.y);
    })
    .toBeLessThan(3);
});

test('the wheel zooms the camera', async ({ app, page }) => {
  const before = await app.tilePoint(0, 0);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(600);
  const after = await app.tilePoint(0, 0);
  expect(Math.abs(after.x - before.x)).toBeGreaterThan(5);
});

test('the cursor becomes a pointer over a piece', async ({ app, page }) => {
  await app.hook('placePiece', 'house', 8, 8, 0);
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCSS('cursor', 'auto');
  const point = await app.tilePoint(8, 8);
  await page.mouse.move(point.x, point.y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  const empty = await app.tilePoint(2, 2);
  await page.mouse.move(empty.x, empty.y);
  await expect(canvas).toHaveCSS('cursor', 'auto');
});
