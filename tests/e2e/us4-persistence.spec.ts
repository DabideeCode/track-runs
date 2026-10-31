import { expect, test, type Page } from '@playwright/test';
import { gameState, openApp, openNewDiorama, place } from './helpers/app';

const SAVE_KEY = 'wooden-diorama:v1';

async function saveAndLeave(page: Page) {
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('back-to-menu').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
}

const names = (page: Page) => page.getByTestId('diorama-open').allInnerTexts();

test.describe('US4: save and manage', () => {
  test('shows an empty state with no saves', async ({ page }) => {
    await openApp(page);
    await expect(page.getByText('No dioramas yet')).toBeVisible();
    await expect(page.getByTestId('diorama-list')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Track' })).toBeVisible();
    await expect(page).toHaveTitle('Track');
  });

  test('a saved diorama survives a reload and reopens identically', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'station', 4, 4, 90);
    await place(page, 'hill', 8, 8, 180);
    await page.getByTestId('flip-direction').click();
    await saveAndLeave(page);
    const saved = await page.evaluate(() => window.__DIORAMA__!.getState());

    await page.reload();
    await expect(page.getByTestId('diorama-item')).toHaveCount(1);
    await page.getByTestId('diorama-open').click();
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
    const reopened = await gameState(page);
    expect(reopened.pieces).toEqual(saved.pieces);
    expect(reopened.startFacing).toBe(180);
    expect(reopened.isDirty).toBe(false);
    expect(reopened.dioramaName).toBe('Untitled diorama');
    expect(reopened.dioramaId).toBe(saved.dioramaId);
  });

  test('entries carry their id, and sort newest first', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await saveAndLeave(page);
    await page.getByTestId('new-diorama').click();
    await expect(page.getByTestId('playfield')).toBeVisible();
    expect((await gameState(page)).dioramaName).toBe('Untitled diorama 2');
    await place(page, 'house', 2, 2);
    await page.waitForTimeout(20);
    await saveAndLeave(page);

    expect(await names(page)).toEqual([
      expect.stringContaining('Untitled diorama 2'),
      expect.stringContaining('Untitled diorama'),
    ]);
    await expect(page.getByTestId('diorama-item').first()).toHaveAttribute('data-diorama-id', /.+/);
  });

  test('renames, refusing blank and over-long names', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await saveAndLeave(page);

    await page.getByTestId('diorama-rename').click();
    await page.getByTestId('rename-input').fill('   ');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByTestId('rename-input').fill('x'.repeat(41));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('rename-input')).toBeVisible();

    await page.getByTestId('rename-input').fill('Loop line');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('rename-input')).toHaveCount(0);
    expect(await names(page)).toEqual([expect.stringContaining('Loop line')]);

    await page.reload();
    expect(await names(page)).toEqual([expect.stringContaining('Loop line')]);
  });

  test('Escape cancels a rename', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await saveAndLeave(page);
    await page.getByTestId('diorama-rename').click();
    await page.getByTestId('rename-input').fill('Other');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rename-input')).toHaveCount(0);
    expect(await names(page)).toEqual([expect.stringContaining('Untitled diorama')]);
  });

  test('deletes only after confirming', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await saveAndLeave(page);

    await page.getByTestId('diorama-delete').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('diorama-item')).toHaveCount(1);

    await page.getByTestId('diorama-delete').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('diorama-item')).toHaveCount(0);
    await expect(page.getByText('No dioramas yet')).toBeVisible();
  });

  test('unsaved changes ask to save, discard or cancel', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);

    await page.getByTestId('back-to-menu').click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('playfield')).toBeVisible();

    await page.getByTestId('back-to-menu').click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('playfield')).toBeVisible();

    await page.getByTestId('back-to-menu').click();
    await page.getByTestId('confirm-discard').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('diorama-item')).toHaveCount(0);

    await page.getByTestId('new-diorama').click();
    await place(page, 'house', 1, 1);
    await page.getByTestId('back-to-menu').click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('diorama-item')).toHaveCount(1);
  });

  test('leaving with no changes asks nothing', async ({ page }) => {
    await openNewDiorama(page);
    await page.getByTestId('back-to-menu').click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('diorama-item')).toHaveCount(0);
  });

  test('corrupt data is skipped with a warning, and the rest still work', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await saveAndLeave(page);
    await page.evaluate((key) => {
      const file = JSON.parse(localStorage.getItem(key)!);
      file.dioramas.push({ id: 'broken', pieces: 'nope' });
      localStorage.setItem(key, JSON.stringify(file));
    }, SAVE_KEY);

    const warnings: string[] = [];
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text());
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.reload();
    await expect(page.getByTestId('diorama-item')).toHaveCount(1);
    expect(warnings.join(' ')).toContain('Skipped');
    expect(errors).toEqual([]);
    await page.getByTestId('diorama-open').click();
    await expect(page.getByTestId('playfield')).toBeVisible();
  });

  test('a wholly corrupt file opens an empty menu without crashing', async ({ page }) => {
    await openApp(page);
    await page.evaluate((key) => localStorage.setItem(key, '{bad'), SAVE_KEY);
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByText('No dioramas yet')).toBeVisible();
  });

  test('a failed save reports it and stays unsaved', async ({ page }) => {
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error('QuotaExceededError');
      };
    });
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('toast')).toContainText('Could not save');
    expect((await gameState(page)).isDirty).toBe(true);
  });

  test('autosaves unsaved changes after 30 seconds in Build mode', async ({ page }) => {
    test.setTimeout(60_000);
    await openNewDiorama(page);
    await place(page, 'house', 1, 1);
    await expect.poll(async () => (await gameState(page)).isDirty, { timeout: 34_000 }).toBe(false);
    await expect(page.getByTestId('toast')).toBeVisible();
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
    expect(stored.dioramas).toHaveLength(1);
  });
});
