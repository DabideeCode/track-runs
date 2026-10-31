import { expect, test } from '@playwright/test';
import { clickTile, dragFromPalette, dragTile, gameState, hook, openNewDiorama, place, soundLog } from './helpers/app';

test.describe('US2: refine and connect', () => {
  test.beforeEach(async ({ page }) => {
    await openNewDiorama(page);
  });

  test('clicking a placed piece selects it', async ({ page }) => {
    const { id } = await place(page, 'straight', 8, 8, 0);
    await clickTile(page, 8, 8);
    expect((await gameState(page)).selectedPieceId).toBe(id);
  });

  test('clicking an empty tile clears the selection', async ({ page }) => {
    await place(page, 'straight', 8, 8, 0);
    await clickTile(page, 8, 8);
    await clickTile(page, 3, 3);
    expect((await gameState(page)).selectedPieceId).toBeNull();
  });

  test('R rotates the selected piece clockwise', async ({ page }) => {
    await place(page, 'straight', 8, 8, 0);
    await clickTile(page, 8, 8);
    await page.keyboard.press('r');
    expect((await gameState(page)).pieces[0]?.rotation).toBe(90);
    expect((await soundLog(page)).at(-1)).toBe('rotate');
  });

  test('dragging a piece moves it, and an invalid drop returns it', async ({ page }) => {
    await place(page, 'straight', 8, 8, 0);
    await place(page, 'house', 10, 10);
    await dragTile(page, [8, 8], [6, 7]);
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 6, gridZ: 7 });

    await dragTile(page, [6, 7], [10, 10]);
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 6, gridZ: 7 });
    expect((await soundLog(page)).at(-1)).toBe('invalid');
  });

  test('R during a drag rotates the ghost', async ({ page }) => {
    await page.getByTestId('palette-straight').hover();
    const box = (await page.getByTestId('palette-straight').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 30, { steps: 3 });
    await page.keyboard.press('r');
    await page.mouse.move(960, 520, { steps: 5 });
    await page.mouse.up();
    expect((await gameState(page)).pieces[0]?.rotation).toBe(90);
  });

  test('Delete, Backspace and the delete button remove the selected piece', async ({ page }) => {
    await expect(page.getByTestId('delete-piece')).toBeDisabled();
    await place(page, 'house', 8, 8);
    await place(page, 'house', 6, 6);
    await place(page, 'house', 10, 6);

    await clickTile(page, 8, 8);
    await page.keyboard.press('Delete');
    expect((await gameState(page)).pieces).toHaveLength(2);

    await clickTile(page, 6, 6);
    await page.keyboard.press('Backspace');
    expect((await gameState(page)).pieces).toHaveLength(1);

    await clickTile(page, 10, 6);
    await expect(page.getByTestId('delete-piece')).toBeEnabled();
    await page.getByTestId('delete-piece').click();
    expect((await gameState(page)).pieces).toHaveLength(0);
    expect((await soundLog(page))).toContain('delete');
  });

  test('a dropped track auto-rotates to connect, and plays snap', async ({ page }) => {
    await place(page, 'straight', 8, 8, 0);
    await page.keyboard.press('Escape');
    const box = (await page.getByTestId('palette-straight').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 30, { steps: 3 });
    await page.keyboard.press('r');
    await page.mouse.up();
    await dragFromPalette(page, 'curve', 8, 9);
    const state = await gameState(page);
    expect(state.pieces.at(-1)).toMatchObject({ type: 'curve', rotation: 180 });
    expect(await hook(page, (h) => h.getConnections().length)).toBe(1);
    expect((await soundLog(page)).slice(-2)).toEqual(['place', 'snap']);
  });

  test('undo and redo work from the keyboard', async ({ page }) => {
    await place(page, 'house', 8, 8);
    await page.keyboard.press('Control+z');
    expect((await gameState(page)).pieces).toHaveLength(0);
    await page.keyboard.press('Control+Shift+z');
    expect((await gameState(page)).pieces).toHaveLength(1);
  });

  test('keyboard shortcuts do nothing with no selection', async ({ page }) => {
    await place(page, 'house', 8, 8);
    await page.keyboard.press('r');
    await page.keyboard.press('Delete');
    expect((await gameState(page)).pieces).toHaveLength(1);
  });
});
