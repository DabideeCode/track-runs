import type { PieceType, Rotation } from '../../src/domain/types';
import { expect, test, type App } from './fixtures';

const LINE: Array<[PieceType, number, number, Rotation]> = [
  ['station', 8, 12, 0],
  ['straight', 8, 11, 0],
  ['straight', 8, 10, 0],
  ['straight', 8, 9, 0],
  ['straight', 8, 8, 0],
  ['straight', 8, 7, 0],
  ['buffer', 8, 6, 0],
];

const LOOP: Array<[PieceType, number, number, Rotation]> = [
  ['station', 6, 8, 0], ['straight', 6, 7, 0], ['curve', 6, 6, 0], ['straight', 7, 6, 90],
  ['curve', 8, 6, 90], ['straight', 8, 7, 0], ['straight', 8, 8, 0], ['curve', 8, 9, 180],
  ['straight', 7, 9, 90], ['curve', 6, 9, 270],
];

async function lay(app: App, pieces: Array<[PieceType, number, number, Rotation]>) {
  for (const [type, x, z, rotation] of pieces) {
    expect((await app.hook('placePiece', type, x, z, rotation)).ok).toBe(true);
  }
}

test.beforeEach(async ({ app }) => {
  await app.open();
  await app.openPlayfield();
});

test('Play needs a station', async ({ app, page }) => {
  await page.getByTestId('mode-toggle').click();
  await expect(page.getByTestId('toast')).toContainText('Place a station to start');
  await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
  expect(await app.hook('setMode', 'play')).toEqual({ ok: false, reason: 'no_station' });
});

test('the train parks at the station in Build mode', async ({ app }) => {
  expect(await app.hook('getTrain')).toBeNull();
  const { id } = await app.hook('placePiece', 'station', 8, 8, 0);
  expect(await app.hook('getTrain')).toEqual({
    pieceId: id,
    progress: 0.5,
    moving: false,
    direction: 'forward',
    speed: 0,
  });
});

test('Auto runs at 1.5, eases at the buffer, waits, then reverses', async ({ app, page }) => {
  await lay(app, LINE);
  await page.getByTestId('mode-toggle').click();
  await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'play');
  expect((await app.sounds())).toContain('whistle');

  await expect.poll(async () => (await app.hook('getTrain'))?.speed).toBeCloseTo(1.5, 1);
  await expect.poll(() => app.sounds(), { timeout: 15_000 }).toContain('bump');
  const stopped = await app.hook('getTrain');
  expect(stopped?.direction).toBe('forward');
  expect(stopped?.moving).toBe(false);

  await expect.poll(async () => (await app.hook('getTrain'))?.direction, { timeout: 3000 }).toBe('reverse');
  await expect.poll(async () => (await app.hook('getTrain'))?.moving).toBe(true);
});

test('a closed loop runs with no dead-end stop', async ({ app, page }) => {
  await lay(app, LOOP);
  expect(await app.hook('getConnections')).toHaveLength(10);
  await app.hook('setMode', 'play');
  await page.waitForTimeout(9000);
  const train = await app.hook('getTrain');
  expect(train?.moving).toBe(true);
  expect(train?.speed).toBeCloseTo(1.5, 1);
  expect(await app.sounds()).not.toContain('bump');
});

test('Manual drives with W and S, and stops on release', async ({ app, page }) => {
  await lay(app, LINE);
  await app.hook('setMode', 'play');
  await page.getByTestId('drive-toggle').click();
  await expect.poll(async () => (await app.hook('getTrain'))?.speed).toBe(0);

  await page.keyboard.down('w');
  await expect.poll(async () => (await app.hook('getTrain'))?.speed, { timeout: 1000, intervals: [25] }).toBe(2);
  await page.keyboard.up('w');
  await expect.poll(async () => (await app.hook('getTrain'))?.speed, { timeout: 500, intervals: [25] }).toBe(0);

  await page.keyboard.down('s');
  await expect.poll(async () => (await app.hook('getTrain'))?.direction).toBe('reverse');
  await expect.poll(async () => (await app.hook('getTrain'))?.speed, { timeout: 1000 }).toBeGreaterThan(0);
  await page.keyboard.up('s');
});

test('Manual stops at a dead end and refuses to go further', async ({ app, page }) => {
  await lay(app, LINE);
  await app.hook('setMode', 'play');
  await app.hook('setDriveMode', 'manual');
  await page.keyboard.down('w');
  await expect.poll(() => app.sounds(), { timeout: 15_000 }).toContain('bump');
  const first = await app.hook('getTrain');
  await page.waitForTimeout(400);
  const second = await app.hook('getTrain');
  await page.keyboard.up('w');
  expect(second?.speed).toBe(0);
  expect(second?.progress).toBeCloseTo(first?.progress ?? 0, 3);
  expect((await app.sounds()).filter((sound) => sound === 'bump')).toHaveLength(1);
});

test('every Play entry starts in Auto', async ({ app }) => {
  await lay(app, LOOP);
  await app.hook('setMode', 'play');
  await app.hook('setDriveMode', 'manual');
  await app.hook('setMode', 'build');
  await app.hook('setMode', 'play');
  expect((await app.state()).driveMode).toBe('auto');
});

test('pieces cannot be edited in Play', async ({ app, page }) => {
  const { id } = await app.hook('placePiece', 'station', 8, 8, 0);
  await app.hook('setMode', 'play');
  expect(await app.hook('placePiece', 'house', 1, 1)).toEqual({ ok: false, reason: 'play_mode' });
  expect(await app.hook('movePiece', id!, 2, 2)).toEqual({ ok: false, reason: 'play_mode' });
  expect(await app.hook('rotatePiece', id!)).toEqual({ ok: false, reason: 'play_mode' });
  expect(await app.hook('removePiece', id!)).toEqual({ ok: false, reason: 'play_mode' });

  await page.keyboard.press('r');
  await page.keyboard.press('Delete');
  await app.clickTile(8, 8);
  const state = await app.state();
  expect(state.pieces).toHaveLength(1);
  expect(state.pieces[0]?.rotation).toBe(0);
  expect(state.selectedPieceId).toBeNull();
  await expect(page.getByTestId('palette-house')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('flip-direction')).toBeDisabled();
});

test('returning to Build parks the train', async ({ app, page }) => {
  await lay(app, LOOP);
  await app.hook('setMode', 'play');
  await page.waitForTimeout(800);
  await app.hook('setMode', 'build');
  expect(await app.hook('getTrain')).toMatchObject({ progress: 0.5, moving: false, speed: 0, direction: 'forward' });
});

test('a lone station still runs without errors', async ({ app, page }) => {
  await app.hook('placePiece', 'station', 8, 8, 0);
  await app.hook('setMode', 'play');
  await page.waitForTimeout(1500);
  expect(await app.hook('getTrain')).not.toBeNull();
});
