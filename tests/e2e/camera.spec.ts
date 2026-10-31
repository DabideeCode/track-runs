import { expect, test, type Page } from '@playwright/test';
import { gameState, openNewDiorama, tileToScreen } from './helpers/app';

/** The tile under a fixed screen point, found by placing a piece there and removing it again. */
async function tileUnder(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y);
  const placed = (await gameState(page)).pieces.at(-1);
  await page.evaluate(() => {
    const hook = window.__DIORAMA__!;
    for (const piece of hook.getState().pieces) hook.removePiece(piece.id);
  });
  return placed ? { x: placed.gridX, z: placed.gridZ } : null;
}

async function settle(page: Page) {
  await page.waitForTimeout(700);
}

test.describe('camera', () => {
  test.beforeEach(async ({ page }) => {
    await openNewDiorama(page);
    await page.getByTestId('palette-house').click();
  });

  test('middle drag pans, right drag orbits, and Reset view restores the default', async ({ page }) => {
    const point = tileToScreen(page, 8, 8);
    expect(await tileUnder(page, point)).toEqual({ x: 8, z: 8 });

    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(point.x + 260, point.y, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    await settle(page);
    const panned = await tileUnder(page, point);
    expect(panned?.x).toBeLessThan(8);

    await page.getByTestId('reset-view').click();
    await settle(page);
    expect(await tileUnder(page, point)).toEqual({ x: 8, z: 8 });

    const edge = tileToScreen(page, 12, 4);
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(edge.x + 300, edge.y, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await settle(page);
    expect(await tileUnder(page, edge)).not.toEqual({ x: 12, z: 4 });

    await page.getByTestId('reset-view').click();
    await settle(page);
    expect(await tileUnder(page, edge)).toEqual({ x: 12, z: 4 });
  });

  test('the wheel zooms', async ({ page }) => {
    const edge = tileToScreen(page, 12, 4);
    await page.mouse.move(edge.x, edge.y);
    await page.mouse.wheel(0, -600);
    await settle(page);
    expect(await tileUnder(page, edge)).not.toEqual({ x: 12, z: 4 });
  });

  test('the left button never moves the camera', async ({ page }) => {
    await page.keyboard.press('Escape');
    const point = tileToScreen(page, 8, 8);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 260, point.y + 90, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    await page.getByTestId('palette-house').click();
    expect(await tileUnder(page, point)).toEqual({ x: 8, z: 8 });
  });

  test('panning cannot take the target beyond the grid', async ({ page }) => {
    const point = tileToScreen(page, 8, 8);
    for (let drag = 0; drag < 6; drag++) {
      await page.mouse.move(point.x - 600, point.y);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(point.x + 700, point.y, { steps: 6 });
      await page.mouse.up({ button: 'middle' });
    }
    await settle(page);
    // The target stops at the grid edge, so the centre of the screen still shows the grid's edge.
    const centre = { x: 960, y: 540 };
    const under = await tileUnder(page, centre);
    expect(under).not.toBeNull();
    expect(under!.x).toBeLessThanOrEqual(1);
  });
});
