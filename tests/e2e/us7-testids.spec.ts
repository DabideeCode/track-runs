import { expect, test } from '@playwright/test';
import { hook, openApp, openNewDiorama, place } from './helpers/app';

const TYPE_IDS = ['straight', 'curve', 'tunnel', 'station', 'buffer', 'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks'];

test.describe('US7: Section 10.1 test ids', () => {
  test('menu ids', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await page.getByTestId('back-to-menu').click();

    for (const id of ['main-menu', 'new-diorama', 'diorama-list', 'diorama-item', 'diorama-open', 'diorama-rename', 'diorama-delete']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await expect(page.getByTestId('diorama-item')).toHaveAttribute('data-diorama-id', /.+/);
    await expect(page.getByTestId('mute-toggle')).toBeVisible();
    await expect(page.getByTestId('music-volume')).toBeVisible();
    await expect(page.getByTestId('sfx-volume')).toBeVisible();

    await page.getByTestId('diorama-rename').click();
    await expect(page.getByTestId('rename-input')).toBeVisible();
    await expect(page.getByTestId('confirm-ok')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('diorama-delete').click();
    await expect(page.getByTestId('confirm-ok')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('playfield ids', async ({ page }) => {
    await openNewDiorama(page);
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
    for (const type of TYPE_IDS) await expect(page.getByTestId(`palette-${type}`)).toBeVisible();
    for (const id of [
      'mode-toggle',
      'drive-toggle',
      'setting-select',
      'flip-direction',
      'save-button',
      'back-to-menu',
      'delete-piece',
      'reset-view',
      'mute-toggle',
      'music-volume',
      'sfx-volume',
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    await place(page, 'station', 5, 5, 0);
    await hook(page, (h) => h.setMode('play'));
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'play');
  });

  test('the unsaved dialog has its discard control', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await page.getByTestId('back-to-menu').click();
    await expect(page.getByTestId('confirm-discard')).toBeVisible();
    await expect(page.getByTestId('confirm-ok')).toBeVisible();
  });

  test('the toast id appears for a message', async ({ page }) => {
    await openNewDiorama(page);
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('toast')).toBeVisible();
  });

  test('the setting selector is a native select with both values', async ({ page }) => {
    await openNewDiorama(page);
    await page.getByTestId('setting-select').selectOption('kitchen');
    await expect(page.getByTestId('setting-select')).toHaveValue('kitchen');
    await page.getByTestId('setting-select').selectOption({ label: 'Bedroom floor' });
    await expect(page.getByTestId('setting-select')).toHaveValue('bedroom');
    await expect(page.getByTestId('setting-select').locator('option')).toHaveCount(2);
  });

  test('the menu has no playfield ids', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('playfield')).toHaveCount(0);
  });
});
