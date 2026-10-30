import { CATALOG } from '../../src/domain/catalog';
import { expect, test } from './fixtures';

const PLAYFIELD_IDS = [
  'mode-toggle', 'drive-toggle', 'setting-select', 'flip-direction', 'save-button',
  'back-to-menu', 'delete-piece', 'reset-view', 'mute-toggle', 'music-volume', 'sfx-volume',
];

test('every listed test id exists', async ({ app, page }) => {
  await app.open();
  for (const id of ['main-menu', 'new-diorama', 'diorama-list']) {
    await expect(page.getByTestId(id)).toHaveCount(1);
  }

  await app.openPlayfield();
  await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
  for (const id of PLAYFIELD_IDS) await expect(page.getByTestId(id)).toHaveCount(1);
  for (const { type } of CATALOG) await expect(page.getByTestId(`palette-${type}`)).toHaveCount(1);
  expect(CATALOG).toHaveLength(12);

  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('toast')).toHaveCount(1);
  await app.hook('placePiece', 'house', 1, 1, 0);
  await page.getByTestId('back-to-menu').click();
  await expect(page.getByTestId('confirm-ok')).toHaveCount(1);
  await expect(page.getByTestId('confirm-discard')).toHaveCount(1);
  await page.getByTestId('confirm-discard').click();

  await expect(page.getByTestId('diorama-item')).toHaveAttribute('data-diorama-id', /.+/);
  for (const id of ['diorama-open', 'diorama-rename', 'diorama-delete']) {
    await expect(page.getByTestId(id)).toHaveCount(1);
  }
  await page.getByTestId('diorama-rename').click();
  await expect(page.getByTestId('rename-input')).toHaveCount(1);
});

test.describe('hook behaviour', () => {
  test.beforeEach(async ({ app }) => {
    await app.open();
    await app.openPlayfield();
  });

  test('getState returns the Section 9 fields as a snapshot', async ({ app, page }) => {
    const state = await app.state();
    expect(Object.keys(state).sort()).toEqual(
      ['dioramaId', 'dioramaName', 'driveMode', 'isDirty', 'mode', 'pieces', 'selectedPieceId', 'selectedTool', 'setting', 'startFacing'].sort(),
    );
    const untouched = await page.evaluate(() => {
      const hook = window.__DIORAMA__!;
      hook.getState().pieces.push({ id: 'x', type: 'house', gridX: 0, gridZ: 0, rotation: 0 });
      return hook.getState().pieces.length;
    });
    expect(untouched).toBe(0);
  });

  test('placePiece reports each reason and logs the agreed sounds', async ({ app }) => {
    const placed = await app.hook('placePiece', 'station', 8, 8, 0);
    expect(placed.ok).toBe(true);
    expect(placed.id).toBeTruthy();
    expect(await app.sounds()).toEqual(['ui', 'place']);

    expect(await app.hook('placePiece', 'station', 1, 1)).toEqual({ ok: false, reason: 'station_limit' });
    expect(await app.hook('placePiece', 'straight', 8, 8)).toEqual({ ok: false, reason: 'occupied' });
    expect(await app.hook('placePiece', 'house', 8, 8)).toEqual({ ok: false, reason: 'on_track' });
    expect(await app.hook('placePiece', 'straight', 16, 0)).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(await app.hook('placePiece', 'hill', 15, 15)).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect((await app.sounds()).filter((sound) => sound === 'invalid')).toHaveLength(5);
  });

  test('not_found and play_mode log no invalid sound', async ({ app }) => {
    expect(await app.hook('movePiece', 'nope', 1, 1)).toEqual({ ok: false, reason: 'not_found' });
    expect(await app.hook('rotatePiece', 'nope')).toEqual({ ok: false, reason: 'not_found' });
    expect(await app.hook('removePiece', 'nope')).toEqual({ ok: false, reason: 'not_found' });
    await app.hook('setMode', 'play');
    await app.hook('placePiece', 'station', 1, 1);
    await app.hook('setMode', 'play');
    await app.hook('placePiece', 'house', 9, 9);
    expect(await app.sounds()).not.toContain('invalid');
  });

  test('omitted rotation auto-adjusts, and a given rotation is used as is', async ({ app }) => {
    await app.hook('placePiece', 'straight', 8, 8, 90);
    const adjusted = await app.hook('placePiece', 'straight', 9, 8);
    const pieces = (await app.state()).pieces;
    expect(pieces.find((piece) => piece.id === adjusted.id)?.rotation).toBe(90);
    expect((await app.sounds()).slice(-2)).toEqual(['place', 'snap']);

    const fixed = await app.hook('placePiece', 'straight', 10, 8, 0);
    const after = (await app.state()).pieces;
    expect(after.find((piece) => piece.id === fixed.id)?.rotation).toBe(0);
    expect((await app.sounds()).slice(-1)).toEqual(['place']);
  });

  test('rotate and move log snap when they connect', async ({ app }) => {
    await app.hook('placePiece', 'straight', 8, 8, 0);
    const other = await app.hook('placePiece', 'straight', 8, 7, 90);
    expect(await app.hook('getConnections')).toHaveLength(0);

    expect(await app.hook('rotatePiece', other.id!)).toEqual({ ok: true });
    expect((await app.sounds()).slice(-2)).toEqual(['rotate', 'snap']);
    expect(await app.hook('getConnections')).toHaveLength(1);

    expect(await app.hook('movePiece', other.id!, 3, 3)).toEqual({ ok: true });
    expect(await app.hook('getConnections')).toHaveLength(0);
    expect(await app.hook('movePiece', other.id!, 8, 9)).toEqual({ ok: true });
    expect((await app.sounds()).slice(-2)).toEqual(['move', 'snap']);
  });

  test('the sound log uses only agreed event names', async ({ app, page }) => {
    await app.hook('placePiece', 'station', 8, 8, 0);
    await app.hook('setMode', 'play');
    await page.waitForTimeout(500);
    const allowed = ['pickup', 'place', 'move', 'rotate', 'delete', 'snap', 'invalid', 'ui', 'whistle', 'chug', 'bump'];
    for (const sound of await app.sounds()) expect(allowed).toContain(sound);
    expect(await app.sounds()).toEqual(expect.arrayContaining(['whistle', 'chug']));
  });

  test('moving a station keeps it, and a hill may overlap its own tiles', async ({ app }) => {
    const station = await app.hook('placePiece', 'station', 8, 8, 0);
    expect((await app.hook('movePiece', station.id!, 9, 9)).ok).toBe(true);
    const hill = await app.hook('placePiece', 'hill', 2, 2);
    expect((await app.hook('movePiece', hill.id!, 3, 2)).ok).toBe(true);
    expect((await app.hook('rotatePiece', hill.id!)).ok).toBe(true);
    const pieces = (await app.state()).pieces;
    expect(pieces.find((piece) => piece.id === hill.id)).toMatchObject({ gridX: 3, gridZ: 2, rotation: 90 });
  });
});

test('the hook is ready on the main menu', async ({ app }) => {
  await app.open();
  expect(await app.hook('getTrain')).toBeNull();
  expect((await app.state()).pieces).toEqual([]);
});
