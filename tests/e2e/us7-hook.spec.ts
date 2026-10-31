import { expect, test } from '@playwright/test';
import { gameState, hook, openNewDiorama, place, soundLog } from './helpers/app';

test.describe('US7: the test hook', () => {
  test.beforeEach(async ({ page }) => {
    await openNewDiorama(page);
  });

  test('exposes exactly the Section 10.2 methods', async ({ page }) => {
    const methods = await page.evaluate(() => Object.keys(window.__DIORAMA__!).sort());
    expect(methods).toEqual(
      [
        'getConnections',
        'getSoundLog',
        'getState',
        'getTrain',
        'movePiece',
        'placePiece',
        'removePiece',
        'rotatePiece',
        'setDriveMode',
        'setMode',
      ].sort(),
    );
  });

  test('getState has every Section 9 field under its exact name', async ({ page }) => {
    const state = await gameState(page);
    expect(Object.keys(state).sort()).toEqual(
      [
        'dioramaId',
        'dioramaName',
        'driveMode',
        'isDirty',
        'mode',
        'pieces',
        'selectedPieceId',
        'selectedTool',
        'setting',
        'startFacing',
      ].sort(),
    );
    expect(state).toMatchObject({
      pieces: [],
      selectedTool: null,
      selectedPieceId: null,
      mode: 'build',
      driveMode: 'auto',
      setting: 'bedroom',
      startFacing: 0,
      dioramaId: null,
      dioramaName: 'Untitled diorama',
      isDirty: false,
    });
  });

  test('results and getState are correct as soon as a call returns', async ({ page }) => {
    const result = await hook(page, (h) => {
      const placed = h.placePiece('straight', 2, 2, 0);
      return { placed, count: h.getState().pieces.length, dirty: h.getState().isDirty };
    });
    expect(result.placed.ok).toBe(true);
    expect(typeof result.placed.id).toBe('string');
    expect(result).toMatchObject({ count: 1, dirty: true });
  });

  test('every reason code', async ({ page }) => {
    const results = await hook(page, (h) => {
      const track = h.placePiece('straight', 0, 0, 0).id!;
      const house = h.placePiece('house', 4, 4).id!;
      const station = h.placePiece('station', 8, 8, 0).id!;
      const reasons = {
        occupiedTrackOnTrack: h.placePiece('straight', 0, 0, 0).reason,
        occupiedTrackOnHouse: h.placePiece('straight', 4, 4, 0).reason,
        occupiedHouseOnHouse: h.placePiece('house', 4, 4).reason,
        onTrack: h.placePiece('house', 0, 0).reason,
        onTrackHill: h.placePiece('hill', 7, 7).reason,
        outOfBounds: h.placePiece('straight', 16, 0, 0).reason,
        outOfBoundsNegative: h.placePiece('straight', -1, 0, 0).reason,
        outOfBoundsHill: h.placePiece('hill', 15, 15).reason,
        stationLimit: h.placePiece('station', 1, 1, 0).reason,
        moveOccupied: h.movePiece(track, 4, 4).reason,
        moveOnTrack: h.movePiece(house, 0, 0).reason,
        moveOutOfBounds: h.movePiece(track, 0, 16).reason,
        moveMissing: h.movePiece('nope', 1, 1).reason,
        rotateMissing: h.rotatePiece('nope').reason,
        removeMissing: h.removePiece('nope').reason,
      };
      const play = h.setMode('play');
      return {
        ...reasons,
        play,
        placeInPlay: h.placePiece('house', 1, 1).reason,
        moveInPlay: h.movePiece(track, 1, 1).reason,
        rotateInPlay: h.rotatePiece(track).reason,
        removeInPlay: h.removePiece(station).reason,
      };
    });
    expect(results).toEqual({
      occupiedTrackOnTrack: 'occupied',
      occupiedTrackOnHouse: 'occupied',
      occupiedHouseOnHouse: 'occupied',
      onTrack: 'on_track',
      onTrackHill: 'on_track',
      outOfBounds: 'out_of_bounds',
      outOfBoundsNegative: 'out_of_bounds',
      outOfBoundsHill: 'out_of_bounds',
      stationLimit: 'station_limit',
      moveOccupied: 'occupied',
      moveOnTrack: 'on_track',
      moveOutOfBounds: 'out_of_bounds',
      moveMissing: 'not_found',
      rotateMissing: 'not_found',
      removeMissing: 'not_found',
      play: { ok: true },
      placeInPlay: 'play_mode',
      moveInPlay: 'play_mode',
      rotateInPlay: 'play_mode',
      removeInPlay: 'play_mode',
    });
    expect(await hook(page, (h) => h.setMode('build'))).toEqual({ ok: true });
    expect((await gameState(page)).pieces).toHaveLength(3);
  });

  test('no_station from setMode', async ({ page }) => {
    expect(await hook(page, (h) => h.setMode('play'))).toEqual({ ok: false, reason: 'no_station' });
  });

  test('an omitted rotation auto-adjusts; a given rotation is used as is', async ({ page }) => {
    await place(page, 'straight', 5, 5, 0);
    await place(page, 'buffer', 5, 6);
    await place(page, 'curve', 5, 4, 180);
    await place(page, 'buffer', 7, 7);
    const pieces = (await gameState(page)).pieces;
    expect(pieces[1]?.rotation).toBe(180); // turned so its connector faces the open end to the north
    expect(pieces[2]?.rotation).toBe(180); // given, so left alone though it does not connect
    expect(pieces[3]?.rotation).toBe(0); // no neighbour, so it stays at 0
    expect(await hook(page, (h) => h.getConnections().length)).toBe(1);
  });

  test('sounds match each action, with no pickup or ui', async ({ page }) => {
    const log = await hook(page, (h) => {
      const before = h.getSoundLog().length;
      const a = h.placePiece('straight', 5, 5, 0).id!;
      h.placePiece('straight', 5, 4, 0);
      h.placePiece('straight', 5, 4, 0);
      h.movePiece(a, 9, 9);
      h.rotatePiece(a);
      h.removePiece(a);
      return h.getSoundLog().slice(before);
    });
    expect(log).toEqual(['place', 'place', 'snap', 'invalid', 'move', 'rotate', 'delete']);
  });

  test('Play sounds come in order: whistle, then chug, then bump at a dead end', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    const before = (await soundLog(page)).length;
    await hook(page, (h) => h.setMode('play'));
    await expect.poll(async () => (await soundLog(page)).slice(before), { timeout: 8000 }).toEqual(
      expect.arrayContaining(['whistle', 'chug', 'bump']),
    );
    const log = (await soundLog(page)).slice(before);
    expect(log.indexOf('whistle')).toBeLessThan(log.indexOf('chug'));
    expect(log.indexOf('chug')).toBeLessThan(log.indexOf('bump'));
  });

  test('getSoundLog only uses the listed event names', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await hook(page, (h) => h.setMode('play'));
    await page.getByTestId('save-button').click();
    const allowed = ['pickup', 'place', 'move', 'rotate', 'delete', 'snap', 'invalid', 'ui', 'whistle', 'chug', 'bump'];
    for (const event of await soundLog(page)) expect(allowed).toContain(event);
  });

  test('getTrain has the contract shape', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await hook(page, (h) => h.setMode('play'));
    const train = await hook(page, (h) => h.getTrain());
    expect(Object.keys(train!).sort()).toEqual(['direction', 'moving', 'pieceId', 'progress', 'speed']);
    expect(train!.progress).toBeGreaterThanOrEqual(0);
    expect(train!.progress).toBeLessThanOrEqual(1);
  });

  test('getConnections pairs each connected couple once', async ({ page }) => {
    const { id: a } = await place(page, 'straight', 5, 5, 0);
    const { id: b } = await place(page, 'straight', 5, 4, 0);
    const connections = await hook(page, (h) => h.getConnections());
    expect(connections).toHaveLength(1);
    expect(connections[0]!.slice().sort()).toEqual([a, b].sort());
  });

  test('setDriveMode changes the driving style in Play', async ({ page }) => {
    await place(page, 'station', 5, 8, 0);
    await hook(page, (h) => h.setMode('play'));
    await hook(page, (h) => h.setDriveMode('manual'));
    expect((await gameState(page)).driveMode).toBe('manual');
  });
});
