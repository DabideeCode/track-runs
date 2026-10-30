/**
 * Persistence end to end (task 18.4).
 *
 * - Saving, reloading and reopening gives back the same name, setting, start
 *   direction and pieces, and every saved diorama is listed after a reload.
 * - The unsaved-changes dialog: Save writes and returns to the menu, Discard
 *   returns without writing, Cancel keeps the playfield and every change.
 * - Corrupt data seeded before the app runs: an unreadable SaveFile shows the
 *   empty state with one warning, and the next save first copies the raw value
 *   to a `wooden-diorama:v1:corrupt-<ISO>` key; invalid entries in a readable
 *   SaveFile are left out with one warning each and kept on the next write.
 *   "No error" is enforced by the page fixture (console.error / pageerror).
 * - Audio settings (and Low quality) survive a reload; defaults apply when
 *   nothing is stored.
 *
 * Requirements: 22.4, 22.5, 22.6, 22.7, 22.8, 22.9, 24.1, 24.2, 24.3, 27.7, 27.8
 */
import type { Page } from '@playwright/test';
import type { Diorama, GameState, Piece, PieceType, Rotation, SaveFile } from '@/domain/types';
import {
  AUDIO_KEY,
  CORRUPT_BACKUP_PREFIX,
  SAVE_KEY,
  SETTINGS_KEY,
  byTestId,
  expect,
  getState,
  gotoApp,
  hook,
  makeDiorama,
  makeSaveFile,
  openNewDiorama,
  readStorage,
  seedStorage,
  storageKeys,
  test,
  waitForHook,
  waitForMenu,
  waitForPlayfield,
} from './helpers';

// Several tests open the WebGL playfield more than once and reload; with
// software rendering and many parallel workers that takes longer than the
// default 30 s.
test.describe.configure({ timeout: 90_000 });

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Collects the text of every console warning the page logs from now on. */
function collectWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  return warnings;
}

/** Warnings from the persistence layer (they name a storage key or a saved diorama). */
const persistenceWarnings = (all: readonly string[]) =>
  all.filter((text) => /wooden-diorama|saved diorama/i.test(text));

/** Waits until exactly `count` persistence warnings have arrived, and no more. */
async function expectPersistenceWarnings(page: Page, warnings: readonly string[], count: number): Promise<string[]> {
  await expect.poll(() => persistenceWarnings(warnings).length).toBeGreaterThanOrEqual(count);
  // Give a late duplicate the chance to show up before checking the exact count.
  await page.waitForTimeout(250);
  const found = persistenceWarnings(warnings);
  expect(found, 'persistence warnings').toHaveLength(count);
  return found;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The parts of a diorama that must survive a save and reload (Requirement 22.5). */
function content(d: Pick<GameState, 'pieces' | 'setting' | 'startFacing'> & { name: string }) {
  return {
    name: d.name,
    setting: d.setting,
    startFacing: d.startFacing,
    pieces: d.pieces
      .map((p: Piece) => ({ id: p.id, type: p.type, gridX: p.gridX, gridZ: p.gridZ, rotation: p.rotation }))
      .sort(byId),
  };
}

async function editorContent(page: Page) {
  const s = await getState(page);
  return content({ ...s, name: s.dioramaName });
}

type Placement = [PieceType, number, number, Rotation];

async function placeAll(page: Page, placements: readonly Placement[]): Promise<void> {
  for (const [type, x, z, rotation] of placements) {
    const r = await hook(page, 'placePiece', type, x, z, rotation);
    expect(r.ok, `placePiece(${type}, ${x}, ${z}, ${rotation}) -> ${r.reason ?? 'ok'}`).toBe(true);
  }
}

/** Switches the setting through the playfield control and waits for it to apply. */
async function chooseSetting(page: Page, label: 'Bedroom floor' | 'Kitchen table'): Promise<void> {
  const value = label === 'Kitchen table' ? 'kitchen' : 'bedroom';
  await byTestId(page, 'setting-select').getByText(label).click();
  await expect(byTestId(page, 'setting-select')).toHaveAttribute('data-value', value);
}

async function flipDirection(page: Page): Promise<void> {
  const before = (await getState(page)).startFacing;
  await byTestId(page, 'flip-direction').click();
  await expect(byTestId(page, 'flip-direction')).toHaveAttribute('data-value', String(before === 0 ? 180 : 0));
}

async function clickSave(page: Page): Promise<void> {
  await byTestId(page, 'save-button').click();
  await expect(byTestId(page, 'toast').filter({ hasText: 'Saved' }).first()).toBeVisible();
  await expect.poll(async () => (await getState(page)).isDirty).toBe(false);
}

async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await waitForMenu(page);
  await waitForHook(page);
}

function menuItem(page: Page, id: string) {
  return page.locator(`[data-testid="diorama-item"][data-diorama-id="${id}"]`);
}

async function openSaved(page: Page, id: string): Promise<void> {
  await menuItem(page, id).locator('[data-testid="diorama-open"]').click();
  await waitForPlayfield(page);
  await expect.poll(async () => (await getState(page)).dioramaId).toBe(id);
}

async function readSaveFile(page: Page): Promise<SaveFile | null> {
  const raw = await readStorage(page, SAVE_KEY);
  return raw === null ? null : (JSON.parse(raw) as SaveFile);
}

async function backupKeys(page: Page): Promise<string[]> {
  return (await storageKeys(page)).filter((k) => k.startsWith(CORRUPT_BACKUP_PREFIX)).sort();
}

async function openUnsavedDialog(page: Page): Promise<void> {
  await byTestId(page, 'back-to-menu').click();
  await expect(byTestId(page, 'confirm-ok')).toBeVisible();
  await expect(byTestId(page, 'confirm-ok')).toHaveText(/Save/);
  await expect(byTestId(page, 'confirm-discard')).toBeVisible();
  await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' })).toBeVisible();
  // The playfield stays open behind the dialog until a choice is made.
  await expect(byTestId(page, 'playfield')).toHaveCount(1);
  await expect(byTestId(page, 'main-menu')).toHaveCount(0);
}

const LAYOUT_A: Placement[] = [
  ['straight', 3, 4, 90],
  ['curve', 6, 6, 180],
  ['tunnel', 9, 2, 0],
  ['station', 8, 9, 90],
  ['buffer', 1, 12, 270],
  ['house', 12, 2, 270],
  ['pineTree', 0, 15, 0],
  ['roundTree', 15, 0, 90],
  ['hill', 13, 12, 180],
  ['car', 5, 13, 90],
  ['cassette', 10, 14, 270],
  ['blocks', 2, 7, 180],
];

const LAYOUT_B: Placement[] = [
  ['straight', 7, 7, 0],
  ['house', 4, 4, 90],
];

// ---------------------------------------------------------------------------
// Save, reload, reopen
// ---------------------------------------------------------------------------

test.describe('save and reload', () => {
  test('every saved diorama is listed after a reload and reopens identical', async ({ page }) => {
    await gotoApp(page);
    await expect(byTestId(page, 'diorama-item')).toHaveCount(0);

    // Diorama A: every piece type, non-default rotations, kitchen, flipped start.
    await openNewDiorama(page);
    await placeAll(page, LAYOUT_A);
    await chooseSetting(page, 'Kitchen table');
    await flipDirection(page);
    expect((await getState(page)).isDirty).toBe(true);
    const a = await editorContent(page);
    expect(a.pieces).toHaveLength(LAYOUT_A.length);
    await clickSave(page);
    const aId = (await getState(page)).dioramaId;
    expect(aId).not.toBeNull();

    // The SaveFile holds exactly what the editor showed.
    const fileA = await readSaveFile(page);
    expect(fileA?.version).toBe(1);
    expect(fileA?.dioramas).toHaveLength(1);
    expect(content(fileA!.dioramas[0]!)).toEqual(a);

    // Diorama B: a second, smaller one with the defaults.
    await byTestId(page, 'back-to-menu').click();
    await waitForMenu(page);
    await openNewDiorama(page);
    await placeAll(page, LAYOUT_B);
    const b = await editorContent(page);
    await clickSave(page);
    const bId = (await getState(page)).dioramaId;
    expect(bId).not.toBeNull();
    expect(bId).not.toBe(aId);

    await reloadApp(page);
    await expect(byTestId(page, 'diorama-item')).toHaveCount(2);
    await expect(menuItem(page, aId!)).toContainText(a.name);
    await expect(menuItem(page, bId!)).toContainText(b.name);

    await openSaved(page, aId!);
    expect(await editorContent(page)).toEqual(a);
    expect((await getState(page)).isDirty).toBe(false);
    await expect(byTestId(page, 'setting-select')).toHaveAttribute('data-value', a.setting);
    await expect(byTestId(page, 'flip-direction')).toHaveAttribute('data-value', String(a.startFacing));

    await byTestId(page, 'back-to-menu').click();
    await waitForMenu(page);
    await openSaved(page, bId!);
    expect(await editorContent(page)).toEqual(b);
    expect((await getState(page)).isDirty).toBe(false);
  });

  test('a seeded diorama reopens identical after a reload', async ({ page }) => {
    const seeded = makeDiorama({
      name: 'Seeded layout',
      setting: 'kitchen',
      startFacing: 180,
      pieces: [
        { id: 'seed-1', type: 'straight', gridX: 0, gridZ: 0, rotation: 90 },
        { id: 'seed-2', type: 'curve', gridX: 15, gridZ: 15, rotation: 270 },
        { id: 'seed-3', type: 'hill', gridX: 7, gridZ: 7, rotation: 180 },
        { id: 'seed-4', type: 'station', gridX: 3, gridZ: 10, rotation: 0 },
      ],
    });
    await seedStorage(page, { [SAVE_KEY]: makeSaveFile([seeded]) });
    await gotoApp(page);
    await reloadApp(page);

    await expect(byTestId(page, 'diorama-item')).toHaveCount(1);
    await openSaved(page, seeded.id);
    expect(await editorContent(page)).toEqual(content(seeded));
    expect((await getState(page)).isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unsaved-changes dialog
// ---------------------------------------------------------------------------

test.describe('unsaved-changes dialog', () => {
  test('Cancel closes the dialog and keeps the playfield with every change and isDirty true', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    await placeAll(page, LAYOUT_B);
    await chooseSetting(page, 'Kitchen table');
    await flipDirection(page);
    const before = await getState(page);
    expect(before.isDirty).toBe(true);

    await openUnsavedDialog(page);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(byTestId(page, 'confirm-ok')).toHaveCount(0);
    await expect(byTestId(page, 'playfield')).toBeVisible();
    const after = await getState(page);
    expect(content({ ...after, name: after.dioramaName })).toEqual(content({ ...before, name: before.dioramaName }));
    expect(after.isDirty).toBe(true);
    expect(after.dioramaId).toBeNull();
    expect(await readStorage(page, SAVE_KEY)).toBeNull();
  });

  test('Save writes the diorama and shows the menu with it listed', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    await placeAll(page, LAYOUT_B);
    await chooseSetting(page, 'Kitchen table');
    const edited = await editorContent(page);

    await openUnsavedDialog(page);
    await byTestId(page, 'confirm-ok').click();

    await waitForMenu(page);
    await expect(byTestId(page, 'confirm-ok')).toHaveCount(0);
    const items = byTestId(page, 'diorama-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText(edited.name);

    const file = await readSaveFile(page);
    expect(file?.dioramas).toHaveLength(1);
    const stored = file!.dioramas[0]!;
    expect(content(stored)).toEqual(edited);
    await expect(items.first()).toHaveAttribute('data-diorama-id', stored.id);

    await openSaved(page, stored.id);
    expect(await editorContent(page)).toEqual(edited);
  });

  test('Discard on a never-saved diorama writes nothing and does not list it', async ({ page }) => {
    await gotoApp(page);
    const keysBefore = (await storageKeys(page)).sort();
    await openNewDiorama(page);
    await placeAll(page, LAYOUT_B);

    await openUnsavedDialog(page);
    await byTestId(page, 'confirm-discard').click();

    await waitForMenu(page);
    await expect(byTestId(page, 'diorama-item')).toHaveCount(0);
    await expect(page.getByText('No dioramas yet')).toBeVisible();
    expect(await readStorage(page, SAVE_KEY)).toBeNull();
    // Audio or other settings may be written by the controls, but no diorama data.
    const keysAfter = (await storageKeys(page)).filter((k) => k.startsWith(SAVE_KEY)).sort();
    expect(keysAfter).toEqual(keysBefore.filter((k) => k.startsWith(SAVE_KEY)));
  });

  test('Discard on a saved diorama keeps the last saved version', async ({ page }) => {
    const saved = makeDiorama({
      name: 'Kept as saved',
      pieces: [
        { id: 'kept-1', type: 'straight', gridX: 2, gridZ: 2, rotation: 0 },
        { id: 'kept-2', type: 'house', gridX: 10, gridZ: 10, rotation: 90 },
      ],
    });
    const raw = makeSaveFile([saved]);
    await seedStorage(page, { [SAVE_KEY]: raw });
    await gotoApp(page);

    await openSaved(page, saved.id);
    await placeAll(page, [['pineTree', 5, 5, 0]]);
    await flipDirection(page);
    expect((await getState(page)).isDirty).toBe(true);

    await openUnsavedDialog(page);
    await byTestId(page, 'confirm-discard').click();

    await waitForMenu(page);
    await expect(byTestId(page, 'diorama-item')).toHaveCount(1);
    expect(await readStorage(page, SAVE_KEY)).toBe(raw);

    await openSaved(page, saved.id);
    expect(await editorContent(page)).toEqual(content(saved));
    expect((await getState(page)).isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Corrupt saved data
// ---------------------------------------------------------------------------

const UNREADABLE: Array<[label: string, raw: string]> = [
  ['the empty string', ''],
  ['text that is not JSON', 'definitely { not json'],
  ['truncated JSON', '{"version":1,"dioramas":[{"id":"x"'],
  ['null', 'null'],
  ['an array', '[]'],
  ['the wrong version', '{"version":2,"dioramas":[]}'],
  ['dioramas that is not an array', '{"version":1,"dioramas":{}}'],
];

test.describe('corrupt saved data', () => {
  for (const [label, raw] of UNREADABLE) {
    test(`a SaveFile that is ${label} shows the empty state with one warning`, async ({ page }) => {
      const warnings = collectWarnings(page);
      await seedStorage(page, { [SAVE_KEY]: raw });
      await gotoApp(page);

      await expect(page.getByText('No dioramas yet')).toBeVisible();
      await expect(byTestId(page, 'diorama-item')).toHaveCount(0);
      await expect(byTestId(page, 'new-diorama')).toBeEnabled();
      const [warning] = await expectPersistenceWarnings(page, warnings, 1);
      expect(warning).toContain(SAVE_KEY);
      // Loading only reads: the raw value is untouched and no backup exists yet.
      expect(await readStorage(page, SAVE_KEY)).toBe(raw);
      expect(await backupKeys(page)).toEqual([]);
    });
  }

  test('the next save backs up the unreadable value character for character, once', async ({ page }) => {
    const raw = '{"version":1,"dioramas":[ oops \u00e9\u2603 \n\t"';
    const warnings = collectWarnings(page);
    await seedStorage(page, { [SAVE_KEY]: raw });
    await gotoApp(page);
    await expectPersistenceWarnings(page, warnings, 1);

    const start = Date.now();
    await openNewDiorama(page);
    await placeAll(page, LAYOUT_B);
    const edited = await editorContent(page);
    await clickSave(page);
    const end = Date.now();

    const keys = await backupKeys(page);
    expect(keys).toHaveLength(1);
    const backupKey = keys[0]!;
    expect(await readStorage(page, backupKey)).toBe(raw);
    const stamp = backupKey.slice(CORRUPT_BACKUP_PREFIX.length);
    expect(new Date(stamp).toISOString()).toBe(stamp);
    const stampMs = Date.parse(stamp);
    expect(stampMs).toBeGreaterThanOrEqual(start - 1000);
    expect(stampMs).toBeLessThanOrEqual(end + 1000);

    // The main key now holds a readable SaveFile with only the new diorama.
    const file = await readSaveFile(page);
    expect(file?.version).toBe(1);
    expect(file?.dioramas).toHaveLength(1);
    expect(content(file!.dioramas[0]!)).toEqual(edited);

    // A second save does not create another backup or touch the first.
    await placeAll(page, [['roundTree', 12, 12, 0]]);
    await clickSave(page);
    expect(await backupKeys(page)).toEqual([backupKey]);
    expect(await readStorage(page, backupKey)).toBe(raw);

    // After a reload the diorama is listed and the backup is still there.
    await reloadApp(page);
    await expect(byTestId(page, 'diorama-item')).toHaveCount(1);
    expect(await backupKeys(page)).toEqual([backupKey]);
    expect(await readStorage(page, backupKey)).toBe(raw);
  });

  test('invalid entries are left out with one warning each and kept on the next save', async ({ page }) => {
    const older = makeDiorama({
      name: 'Older valid',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      pieces: [{ id: 'old-1', type: 'straight', gridX: 4, gridZ: 4, rotation: 0 }],
    });
    const newer = makeDiorama({
      name: 'Newer valid',
      createdAt: '2026-01-01T09:00:00.000Z',
      updatedAt: '2026-02-01T10:00:00.000Z',
    });
    const blankName = { ...makeDiorama(), name: '   ' };
    const badPiece = makeDiorama({ pieces: [{ id: 'oops', type: 'straight', gridX: 16, gridZ: 0, rotation: 0 }] });
    const badSetting = { ...makeDiorama(), setting: 'garden' };
    const entries: unknown[] = [older, blankName, 42, newer, badPiece, badSetting, null];
    const raw = JSON.stringify({ version: 1, dioramas: entries });

    const warnings = collectWarnings(page);
    await seedStorage(page, { [SAVE_KEY]: raw });
    await gotoApp(page);

    const items = byTestId(page, 'diorama-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveAttribute('data-diorama-id', newer.id);
    await expect(items.nth(1)).toHaveAttribute('data-diorama-id', older.id);
    const found = await expectPersistenceWarnings(page, warnings, 5);
    for (const w of found) expect(w).toMatch(/Skipped saved diorama/);

    // Edit and save the older entry: the invalid entries stay as they were, in place.
    await openSaved(page, older.id);
    await placeAll(page, [['house', 9, 9, 180]]);
    const edited = await editorContent(page);
    await clickSave(page);

    const file = await readSaveFile(page);
    expect(file?.dioramas).toHaveLength(entries.length);
    const written = file!.dioramas as unknown[];
    for (const i of [1, 2, 4, 5, 6]) expect(written[i], `entry ${i}`).toEqual(entries[i]);
    expect(written[3]).toEqual(newer);
    expect(content(written[0] as Diorama)).toEqual(edited);
    expect((written[0] as Diorama).id).toBe(older.id);
    // A readable SaveFile is never backed up.
    expect(await backupKeys(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Audio settings
// ---------------------------------------------------------------------------

const musicThumb = (page: Page) => byTestId(page, 'music-volume').getByRole('slider');
const sfxThumb = (page: Page) => byTestId(page, 'sfx-volume').getByRole('slider');
const lowQualityToggle = (page: Page) => page.getByRole('button', { name: 'Low quality' });

async function expectAudioControls(page: Page, muted: boolean, music: number, sfx: number): Promise<void> {
  await expect(byTestId(page, 'mute-toggle')).toHaveAttribute('aria-pressed', String(muted));
  await expect(musicThumb(page)).toHaveAttribute('aria-valuenow', String(music));
  await expect(sfxThumb(page)).toHaveAttribute('aria-valuenow', String(sfx));
}

async function readJson(page: Page, key: string): Promise<unknown> {
  const raw = await readStorage(page, key);
  return raw === null ? null : JSON.parse(raw);
}

test.describe('audio settings', () => {
  test('defaults apply when nothing is stored, with no warning', async ({ page }) => {
    const warnings = collectWarnings(page);
    await gotoApp(page);
    await openNewDiorama(page);
    await expectAudioControls(page, false, 0.5, 0.8);
    await expect(lowQualityToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(250);
    expect(persistenceWarnings(warnings)).toEqual([]);
  });

  test('stored settings are applied on load', async ({ page }) => {
    await seedStorage(page, {
      [AUDIO_KEY]: JSON.stringify({ muted: true, musicVolume: 0.7, sfxVolume: 0.15 }),
      [SETTINGS_KEY]: JSON.stringify({ lowQuality: true }),
    });
    await gotoApp(page);
    await openNewDiorama(page);
    await expectAudioControls(page, true, 0.7, 0.15);
    await expect(lowQualityToggle(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('mute, volumes and low quality are stored on change and survive a reload', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);

    await byTestId(page, 'mute-toggle').click();
    await musicThumb(page).focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp'); // 10 steps of 0.01 each
    await sfxThumb(page).focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 2; i++) await page.keyboard.press('PageUp');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await lowQualityToggle(page).click();

    await expectAudioControls(page, true, 0.3, 0.25);
    await expect.poll(() => readJson(page, AUDIO_KEY)).toEqual({ muted: true, musicVolume: 0.3, sfxVolume: 0.25 });
    await expect.poll(() => readJson(page, SETTINGS_KEY)).toEqual({ lowQuality: true });

    // Settings changes do not touch the diorama.
    expect((await getState(page)).isDirty).toBe(false);
    await byTestId(page, 'back-to-menu').click();
    await waitForMenu(page);

    await reloadApp(page);
    await openNewDiorama(page);
    await expectAudioControls(page, true, 0.3, 0.25);
    await expect(lowQualityToggle(page)).toHaveAttribute('aria-pressed', 'true');

    // Unmuting is stored too, and keeps the volumes.
    await byTestId(page, 'mute-toggle').click();
    await expect.poll(() => readJson(page, AUDIO_KEY)).toEqual({ muted: false, musicVolume: 0.3, sfxVolume: 0.25 });
    await reloadApp(page);
    await openNewDiorama(page);
    await expectAudioControls(page, false, 0.3, 0.25);
  });
});
