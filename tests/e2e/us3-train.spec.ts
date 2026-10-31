import { expect, test, type Page } from '@playwright/test';
import { gameState, hook, openNewDiorama, place, soundLog } from './helpers/app';

const train = (page: Page) => hook(page, (h) => h.getTrain());

async function buildLine(page: Page) {
  await place(page, 'station', 5, 10, 0);
  for (let z = 9; z >= 4; z--) await place(page, 'straight', 5, z, 0);
  await place(page, 'buffer', 5, 3, 0);
  return (await gameState(page)).pieces;
}

async function buildLoop(page: Page) {
  await place(page, 'station', 5, 8, 0);
  await place(page, 'straight', 5, 7, 0);
  await place(page, 'curve', 5, 6, 0);
  await place(page, 'curve', 6, 6, 90);
  await place(page, 'straight', 6, 7, 0);
  await place(page, 'straight', 6, 8, 0);
  await place(page, 'curve', 6, 9, 180);
  await place(page, 'curve', 5, 9, 270);
}

test.describe('US3: play with the train', () => {
  test.beforeEach(async ({ page }) => {
    await openNewDiorama(page);
  });

  test('Play without a station shows the message and stays in Build', async ({ page }) => {
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('toast')).toHaveText('Place a station to start');
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
    expect(await hook(page, (h) => h.setMode('play'))).toEqual({ ok: false, reason: 'no_station' });
  });

  test('entering Play starts the train in Auto and disables editing', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'play');
    expect((await gameState(page)).driveMode).toBe('auto');
    expect((await soundLog(page))).toContain('whistle');
    await expect(page.getByTestId('palette-straight')).toBeDisabled();
    await expect(page.getByTestId('flip-direction')).toBeDisabled();
    await expect(page.getByTestId('drive-toggle')).toBeEnabled();
    expect(await place(page, 'house', 1, 1)).toEqual({ ok: false, reason: 'play_mode' });
  });

  test('entering Play always starts in Auto, whatever the toggle was', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await hook(page, (h) => h.setDriveMode('manual'));
    await hook(page, (h) => h.setMode('play'));
    expect((await gameState(page)).driveMode).toBe('auto');
  });

  test('the train reports moving at once and reaches 1.5 tiles per second', async ({ page }) => {
    await buildLoop(page);
    const started = await hook(page, (h) => {
      const ok = h.setMode('play').ok;
      return { ok, moving: h.getTrain()?.moving };
    });
    expect(started).toEqual({ ok: true, moving: true });
    await expect.poll(async () => (await train(page))?.speed ?? 0, { timeout: 5000 }).toBeCloseTo(1.5, 1);
  });

  test('Auto keeps running on a closed loop', async ({ page }) => {
    await buildLoop(page);
    await hook(page, (h) => h.setMode('play'));
    const pieces = new Set<string>();
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(350);
      const current = await train(page);
      expect(current?.moving).toBe(true);
      pieces.add(current!.pieceId);
    }
    expect(pieces.size).toBeGreaterThan(3);
    expect(await soundLog(page)).not.toContain('bump');
  });

  test('Auto stops at the buffer, pauses and reverses', async ({ page }) => {
    await buildLine(page);
    await hook(page, (h) => h.setMode('play'));
    await expect.poll(async () => (await train(page))?.moving, { timeout: 12000 }).toBe(false);
    expect(await soundLog(page)).toContain('bump');
    expect((await train(page))?.direction).toBe('forward');
    await expect.poll(async () => (await train(page))?.direction, { timeout: 4000 }).toBe('reverse');
    expect((await train(page))?.moving).toBe(true);
  });

  test('Manual: W drives, release stops, S reverses', async ({ page }) => {
    await buildLoop(page);
    await hook(page, (h) => h.setMode('play'));
    await page.getByTestId('drive-toggle').click();
    expect((await gameState(page)).driveMode).toBe('manual');
    await expect.poll(async () => (await train(page))?.speed, { timeout: 4000 }).toBe(0);

    await page.keyboard.down('w');
    await expect.poll(async () => (await train(page))?.speed ?? 0, { timeout: 4000 }).toBeGreaterThan(1.9);
    expect((await train(page))?.direction).toBe('forward');
    await page.keyboard.up('w');
    await expect.poll(async () => (await train(page))?.moving, { timeout: 4000 }).toBe(false);

    await page.keyboard.down('s');
    await expect.poll(async () => (await train(page))?.moving, { timeout: 4000 }).toBe(true);
    expect((await train(page))?.direction).toBe('reverse');
    await page.keyboard.up('s');
  });

  test('Manual stops at an open end, and the other key still works', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await place(page, 'straight', 5, 7, 0);
    await place(page, 'straight', 5, 6, 0);
    await hook(page, (h) => h.setMode('play'));
    await hook(page, (h) => h.setDriveMode('manual'));
    await page.keyboard.down('w');
    await expect.poll(async () => (await train(page))?.speed ?? 0, { timeout: 5000 }).toBeGreaterThan(0.5);
    await expect.poll(async () => (await train(page))?.moving, { timeout: 8000 }).toBe(false);
    expect(await soundLog(page)).toContain('bump');
    await page.keyboard.up('w');
    const stoppedAt = await train(page);
    await page.keyboard.down('s');
    await expect
      .poll(async () => {
        const now = await train(page);
        return now?.pieceId !== stoppedAt?.pieceId || now?.progress !== stoppedAt?.progress;
      })
      .toBe(true);
    await page.keyboard.up('s');
  });

  test('returning to Build parks the train at the station', async ({ page }) => {
    await buildLoop(page);
    const station = (await gameState(page)).pieces[0]!;
    await hook(page, (h) => h.setMode('play'));
    await page.waitForTimeout(900);
    await page.getByTestId('mode-toggle').click();
    await expect(page.getByTestId('playfield')).toHaveAttribute('data-mode', 'build');
    expect(await train(page)).toEqual({ pieceId: station.id, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
    await expect(page.getByTestId('palette-straight')).toBeEnabled();
  });

  test('Flip direction and F toggle the start facing in Build only', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    expect((await gameState(page)).startFacing).toBe(0);
    await page.getByTestId('flip-direction').click();
    expect((await gameState(page)).startFacing).toBe(180);
    await page.keyboard.press('f');
    expect((await gameState(page)).startFacing).toBe(0);
    await hook(page, (h) => h.setMode('play'));
    await page.keyboard.press('f');
    expect((await gameState(page)).startFacing).toBe(0);
  });

  test('a lone station never locks up', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await hook(page, (h) => h.setMode('play'));
    await expect.poll(async () => (await train(page))?.direction, { timeout: 6000 }).toBe('reverse');
  });

  test('setting the current mode does not restart the train', async ({ page }) => {
    await buildLoop(page);
    await hook(page, (h) => h.setMode('play'));
    await page.waitForTimeout(600);
    expect(await hook(page, (h) => h.setMode('play'))).toEqual({ ok: true });
    expect((await soundLog(page)).filter((event) => event === 'whistle')).toHaveLength(1);
  });

  test('no train is reported with no station', async ({ page }) => {
    expect(await train(page)).toBeNull();
    const { id } = await place(page, 'station', 5, 8, 0);
    expect((await train(page))?.pieceId).toBe(id);
    await page.evaluate((pieceId) => window.__DIORAMA__!.removePiece(pieceId), id!);
    expect(await train(page)).toBeNull();
  });
});
