import { expect, test } from './fixtures';

const KEY = 'wooden-diorama:v1';

test('saves, survives a reload and reopens identically', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'station', 8, 8, 90);
  await app.hook('placePiece', 'hill', 2, 2, 180);
  await page.getByTestId('setting-select').selectOption('kitchen');
  await page.keyboard.press('f');
  const before = await app.state();
  expect(before.isDirty).toBe(true);

  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toContainText('Saved');
  const saved = await app.state();
  expect(saved.isDirty).toBe(false);
  expect(saved.dioramaId).not.toBeNull();

  await page.reload();
  await expect(page.getByTestId('diorama-item')).toHaveCount(1);
  await page.getByTestId('diorama-open').click();
  await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
  const reopened = await app.state();
  expect(reopened.pieces).toEqual(before.pieces);
  expect(reopened.setting).toBe('kitchen');
  expect(reopened.startFacing).toBe(180);
  expect(reopened.dioramaName).toBe(before.dioramaName);
  expect(reopened.isDirty).toBe(false);
});

test('the save file has the agreed shape', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'house', 1, 1, 0);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  const file = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(file.version).toBe(1);
  expect(file.dioramas[0]).toMatchObject({
    name: 'Untitled diorama',
    setting: 'bedroom',
    startFacing: 0,
    pieces: [{ type: 'house', gridX: 1, gridZ: 1, rotation: 0 }],
  });
  expect(Date.parse(file.dioramas[0].createdAt)).not.toBeNaN();
});

test('default names count up and the list shows newest first', async ({ app, page }) => {
  await app.open();
  await expect(page.getByText('No dioramas yet')).toBeVisible();

  for (const name of ['Untitled diorama', 'Untitled diorama 2']) {
    await app.openPlayfield();
    expect((await app.state()).dioramaName).toBe(name);
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await page.getByTestId('back-to-menu').click();
  }

  await expect(page.getByTestId('diorama-open')).toHaveText(['Untitled diorama 2', 'Untitled diorama']);
  await expect(page.getByTestId('diorama-item').first()).toContainText('Edited');
});

test('rename enforces its limits', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('back-to-menu').click();

  await page.getByTestId('diorama-rename').click();
  await page.getByTestId('rename-input').fill('    ');
  await page.getByTestId('rename-input').press('Enter');
  await expect(page.getByRole('alert')).toContainText('blank');

  await page.getByTestId('rename-input').fill('a'.repeat(41));
  await page.getByTestId('rename-input').press('Enter');
  await expect(page.getByRole('alert')).toContainText('40');

  await page.getByTestId('rename-input').press('Escape');
  await expect(page.getByTestId('diorama-open')).toHaveText('Untitled diorama');

  await page.getByTestId('diorama-rename').click();
  await page.getByTestId('rename-input').fill('  Garden loop ');
  await page.getByTestId('rename-input').press('Enter');
  await expect(page.getByTestId('diorama-open')).toHaveText('Garden loop');
});

test('delete needs confirming', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('back-to-menu').click();

  await page.getByTestId('diorama-delete').click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('diorama-item')).toHaveCount(1);

  await page.getByTestId('diorama-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('diorama-item')).toHaveCount(0);
  await expect(page.getByText('No dioramas yet')).toBeVisible();
});

test('leaving with unsaved changes offers save, discard and cancel', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'house', 1, 1, 0);

  await page.getByTestId('back-to-menu').click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('playfield')).toBeVisible();

  await page.getByTestId('back-to-menu').click();
  await page.getByTestId('confirm-discard').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('diorama-item')).toHaveCount(0);

  await app.openPlayfield();
  await app.hook('placePiece', 'house', 1, 1, 0);
  await page.getByTestId('back-to-menu').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('diorama-item')).toHaveCount(1);
});

test('an untouched new diorama leaves without a prompt and is not kept', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await page.getByTestId('back-to-menu').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('diorama-item')).toHaveCount(0);
});

test('a corrupt entry is skipped with a warning, and others still load', async ({ app, page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        dioramas: [
          { id: 'bad', name: 42 },
          {
            id: 'good',
            name: 'Safe',
            setting: 'bedroom',
            startFacing: 0,
            pieces: [],
            createdAt: '2026-10-30T10:00:00.000Z',
            updatedAt: '2026-10-30T10:00:00.000Z',
          },
        ],
      }),
    );
  }, KEY);
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await app.open();
  await expect(page.getByTestId('diorama-item')).toHaveCount(1);
  await expect(page.getByTestId('diorama-item')).toHaveAttribute('data-diorama-id', 'good');
  expect(warnings.some((text) => text.includes('unreadable'))).toBe(true);
});

test('a wholly unreadable file never crashes the app', async ({ app, page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, '{not json'), KEY);
  await app.open();
  await expect(page.getByText('No dioramas yet')).toBeVisible();
});

test('a failed save says so and keeps the changes marked', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'house', 1, 1, 0);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('full');
    };
  });
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toContainText('Could not save');
  expect((await app.state()).isDirty).toBe(true);
});
