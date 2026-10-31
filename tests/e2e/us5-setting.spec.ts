import { expect, test } from '@playwright/test';
import { gameState, openNewDiorama, place } from './helpers/app';

test.describe('US5: choose a setting', () => {
  test('offers exactly the two settings, starting on Bedroom floor', async ({ page }) => {
    await openNewDiorama(page);
    const select = page.getByTestId('setting-select');
    await expect(select).toHaveValue('bedroom');
    await expect(select.locator('option')).toHaveText(['Bedroom floor', 'Kitchen table']);
  });

  test('switching keeps every piece in place and marks the diorama unsaved', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'station', 4, 4, 90);
    await place(page, 'hill', 8, 8);
    await page.getByTestId('save-button').click();
    await expect.poll(async () => (await gameState(page)).isDirty).toBe(false);
    const before = (await gameState(page)).pieces;

    await page.getByTestId('setting-select').selectOption('kitchen');
    const after = await gameState(page);
    expect(after.setting).toBe('kitchen');
    expect(after.pieces).toEqual(before);
    expect(after.isDirty).toBe(true);
  });

  test('the setting is saved and reopened', async ({ page }) => {
    await openNewDiorama(page);
    await page.getByTestId('setting-select').selectOption('kitchen');
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await page.getByTestId('back-to-menu').click();
    await page.reload();
    await page.getByTestId('diorama-open').click();
    await expect(page.getByTestId('setting-select')).toHaveValue('kitchen');
    expect((await gameState(page)).setting).toBe('kitchen');
  });

  test('keyboard shortcuts still work after using the selector', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'station', 4, 4, 0);
    await page.getByTestId('setting-select').selectOption('kitchen');
    await page.keyboard.press('f');
    expect((await gameState(page)).startFacing).toBe(180);
  });
});
