import { expect, test } from '@playwright/test';
import { clickTile, dragFromPalette, gameState, openNewDiorama, place, soundLog, tileToScreen } from './helpers/app';

test.describe('US1: build on the grid', () => {
  test.beforeEach(async ({ page }) => {
    await openNewDiorama(page);
  });

  test('dragging from the palette places exactly one piece on the tile', async ({ page }) => {
    await dragFromPalette(page, 'straight', 8, 8);
    const state = await gameState(page);
    expect(state.pieces).toHaveLength(1);
    expect(state.pieces[0]).toMatchObject({ type: 'straight', gridX: 8, gridZ: 8 });
    const log = await soundLog(page);
    expect(log).toContain('pickup');
    expect(log).toContain('place');
  });

  test('the ghost state is valid over a free tile and invalid over an occupied one', async ({ page }) => {
    await place(page, 'straight', 5, 5, 0);
    const box = (await page.getByTestId('palette-house').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 3 });

    const free = tileToScreen(page, 8, 8);
    await page.mouse.move(free.x, free.y, { steps: 4 });
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-drag-valid', 'true');

    const taken = tileToScreen(page, 5, 5);
    await page.mouse.move(taken.x, taken.y, { steps: 4 });
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-drag-valid', 'false');
    await page.mouse.up();
  });

  test('clicking a tile places the selected palette item, and the tool stays selected', async ({ page }) => {
    await page.getByTestId('palette-pineTree').click();
    expect((await gameState(page)).selectedTool).toBe('pineTree');
    await clickTile(page, 3, 3);
    await clickTile(page, 4, 3);
    const state = await gameState(page);
    expect(state.pieces.map((p) => [p.gridX, p.gridZ])).toEqual([[3, 3], [4, 3]]);
    expect(state.selectedTool).toBe('pineTree');
  });

  test('a drop on an invalid tile cancels and plays the invalid sound', async ({ page }) => {
    await place(page, 'straight', 5, 5, 0);
    await dragFromPalette(page, 'house', 5, 5);
    expect((await gameState(page)).pieces).toHaveLength(1);
    expect((await soundLog(page)).at(-1)).toBe('invalid');
  });

  test('a hill partly off the grid is cancelled', async ({ page }) => {
    await dragFromPalette(page, 'hill', 15, 8);
    expect((await gameState(page)).pieces).toHaveLength(0);
    expect((await soundLog(page)).at(-1)).toBe('invalid');
  });

  test('a drop back on the palette counts as off the grid', async ({ page }) => {
    const box = (await page.getByTestId('palette-house').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 3 });
    await page.mouse.up();
    expect((await gameState(page)).pieces).toHaveLength(0);
    expect((await soundLog(page)).at(-1)).toBe('invalid');
  });

  test('Escape cancels a drag, then deselects the tool', async ({ page }) => {
    await page.getByTestId('palette-house').click();
    const box = (await page.getByTestId('palette-blocks').boundingBox())!;
    const target = tileToScreen(page, 8, 8);
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    let state = await gameState(page);
    expect(state.pieces).toHaveLength(0);
    expect(state.selectedTool).toBe('house');
    expect(await soundLog(page)).not.toContain('invalid');

    await page.keyboard.press('Escape');
    state = await gameState(page);
    expect(state.selectedTool).toBeNull();
  });

  test('the station item is disabled while a station exists', async ({ page }) => {
    await expect(page.getByTestId('palette-station')).toBeEnabled();
    await place(page, 'station', 4, 4, 0);
    await expect(page.getByTestId('palette-station')).toBeDisabled();
  });

  test('the palette lists all 12 items in two groups', async ({ page }) => {
    for (const type of ['straight', 'curve', 'tunnel', 'station', 'buffer', 'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks']) {
      await expect(page.getByTestId(`palette-${type}`)).toBeVisible();
    }
    await expect(page.getByRole('group', { name: 'Tracks' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Decorations' })).toBeVisible();
  });

  test('Reset view keeps the app working after camera input', async ({ page }) => {
    const centre = tileToScreen(page, 8, 8);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(centre.x + 120, centre.y + 40, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, 300);
    await page.getByTestId('reset-view').click();
    await page.waitForTimeout(1200);
    await dragFromPalette(page, 'straight', 8, 8);
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 8, gridZ: 8 });
  });
});
