/**
 * Hook-driven building and play (task 18.2).
 *
 * - Build actions through `window.__DIORAMA__`: place, move, rotate and remove
 *   with every reason code (`out_of_bounds`, `not_found`, `on_track`,
 *   `occupied`, `station_limit`, `play_mode`, plus `no_station` from
 *   `setMode`). After each call the test checks the result, `pieces`,
 *   `isDirty`, `getConnections()` and the sound events the call appended.
 * - Play mode entry with and without a station; `data-mode` stays `build`
 *   when the entry is rejected.
 * - `getTrain()` motion: Auto cruise on a closed loop, Auto stop, pause and
 *   reversal on a dead-end line, and Manual driving with the W and S keys.
 *
 * Train motion is time-based, so the train tests record `getTrain()` once per
 * animation frame inside the page (with `performance.now()` timestamps, and
 * the times of W and S key events) and check durations on those samples.
 * The simulation clamps a frame to 0.1 s, so on a slow browser simulated time
 * can run slower than wall time; the upper time limits include some slack.
 *
 * Requirements: 18.2, 18.3, 18.5, 18.6, 20.2, 20.4, 20.5, 21.1, 21.2, 37.15,
 * 39.3, 39.7, 39.9, 39.12, 39.16
 */
import type { Page } from '@playwright/test';
import type { GameState, PieceType, Rotation } from '@/domain/types';
import type { DioramaTestHook } from '@/testHook/installTestHook';
import { byTestId, expect, getState, gotoApp, hook, openNewDiorama, test } from './helpers';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

type Pair = [string, string];
type Train = NonNullable<ReturnType<DioramaTestHook['getTrain']>>;

type ActMethod = 'placePiece' | 'movePiece' | 'rotatePiece' | 'removePiece' | 'setMode';

interface ActOutcome {
  /** The `{ ok, id?, reason? }` result of the call. */
  result: { ok: boolean; id?: string; reason?: string };
  /** Sound events appended by this call (the call is synchronous, so no frame runs in between). */
  sounds: string[];
  state: GameState;
  connections: Pair[];
}

/** Calls one hook method and, in the same synchronous turn, reads the sounds it logged, the state and the connections. */
async function act<M extends ActMethod>(
  page: Page,
  method: M,
  ...args: Parameters<DioramaTestHook[M]>
): Promise<ActOutcome> {
  return page.evaluate(
    ([m, a]) => {
      const h = window.__DIORAMA__;
      if (!h) throw new Error('window.__DIORAMA__ is not defined');
      const before = h.getSoundLog().length;
      const result = (h[m] as (...x: unknown[]) => unknown)(...a);
      return {
        result,
        sounds: h.getSoundLog().slice(before),
        state: h.getState(),
        connections: h.getConnections(),
      };
    },
    [method, args] as [M, unknown[]],
  ) as Promise<ActOutcome>;
}

/** A connection pair with its ids sorted, as `getConnections` reports it. */
function pair(a: string, b: string): Pair {
  return a < b ? [a, b] : [b, a];
}

/** Pairs sorted lexicographically, as `getConnections` reports them. */
function pairs(...list: Pair[]): Pair[] {
  return [...list].sort((x, y) => (x[0] === y[0] ? (x[1] < y[1] ? -1 : 1) : x[0] < y[0] ? -1 : 1));
}

/** Places a piece with an explicit rotation and returns its id. */
async function place(page: Page, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Promise<string> {
  const r = await hook(page, 'placePiece', type, gridX, gridZ, rotation);
  expect(r, `place ${type} at (${gridX}, ${gridZ}) rotation ${rotation}`).toMatchObject({ ok: true });
  return r.id!;
}

/** Expects a failed build action that appended only `invalid` and left pieces and isDirty as they were. */
function expectRejected(out: ActOutcome, reason: string, before: GameState): void {
  expect(out.result).toEqual({ ok: false, reason });
  expect(out.sounds).toEqual(['invalid']);
  expect(out.state.pieces).toEqual(before.pieces);
  expect(out.state.isDirty).toBe(before.isDirty);
}

interface TrainSample extends Train {
  t: number;
}

interface KeySample {
  t: number;
  type: 'keydown' | 'keyup';
  key: string;
}

interface Recorder {
  samples: TrainSample[];
  keys: KeySample[];
  playAt: number | null;
}

/** Starts recording `getTrain()` every animation frame and every key event, in the page. */
async function startTrainRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __e2eTrain?: Recorder };
    const rec: Recorder = { samples: [], keys: [], playAt: null };
    w.__e2eTrain = rec;
    const loop = () => {
      if (w.__e2eTrain !== rec) return;
      const t = window.__DIORAMA__?.getTrain();
      if (t) rec.samples.push({ t: performance.now(), ...t });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    for (const type of ['keydown', 'keyup'] as const) {
      window.addEventListener(type, (e) => rec.keys.push({ t: performance.now(), type, key: e.key }), true);
    }
  });
}

function readRecorder(page: Page): Promise<Recorder> {
  return page.evaluate(() => (window as unknown as { __e2eTrain: Recorder }).__e2eTrain);
}

/** Enters Play mode and, in the same turn, notes the time and the sounds it logged. */
async function enterPlay(page: Page, driveMode?: 'manual'): Promise<{ result: { ok: boolean; reason?: string }; sounds: string[] }> {
  return page.evaluate((manual) => {
    const h = window.__DIORAMA__!;
    const rec = (window as unknown as { __e2eTrain?: Recorder }).__e2eTrain;
    const before = h.getSoundLog().length;
    if (rec) rec.playAt = performance.now();
    const result = h.setMode('play');
    if (manual) h.setDriveMode('manual');
    return { result, sounds: h.getSoundLog().slice(before) };
  }, driveMode === 'manual');
}

/**
 * Waits until the train matches; the condition runs in the page. With a
 * recorder running it checks the latest recorded sample, so the matching
 * state is guaranteed to be in the samples read afterwards.
 */
async function waitForTrain(
  page: Page,
  condition: { moving?: boolean; direction?: 'forward' | 'reverse'; minSpeed?: number },
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (c) => {
      const rec = (window as unknown as { __e2eTrain?: Recorder }).__e2eTrain;
      const t = rec ? rec.samples[rec.samples.length - 1] : window.__DIORAMA__?.getTrain();
      if (!t) return false;
      if (c.moving !== undefined && t.moving !== c.moving) return false;
      if (c.direction !== undefined && t.direction !== c.direction) return false;
      if (c.minSpeed !== undefined && t.speed < c.minSpeed) return false;
      return true;
    },
    condition,
    { timeout },
  );
}

/** Moves keyboard focus off any control, so W and S reach the window handler as plain keys. */
async function focusPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el !== document.body) el.blur();
  });
}

// Each test makes dozens of hook round trips and renders WebGL; under parallel
// load (several workers and runners on one machine) 30 s is too tight.
test.describe.configure({ timeout: 90_000 });

const TRAIN_SOUNDS = new Set(['whistle', 'chug', 'bump']);
/** Slack for upper time limits: rAF sampling granularity plus slow-frame clamping in the simulation. */
const SLACK_MS = 400;

// ---------------------------------------------------------------------------
// Building through the hook
// ---------------------------------------------------------------------------

test.describe('build actions through the hook', () => {
  test('place, move, rotate and remove: results, reason codes, connections and sounds after each call', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);

    const clean = await getState(page);
    expect(clean.pieces).toEqual([]);
    expect(clean.isDirty).toBe(false);

    // --- Rejections on an empty, clean diorama: isDirty stays false. ---
    let before = clean;
    expectRejected(await act(page, 'placePiece', 'straight', -1, 0, 0), 'out_of_bounds', before);
    expectRejected(await act(page, 'placePiece', 'straight', 16, 3, 0), 'out_of_bounds', before);
    expectRejected(await act(page, 'placePiece', 'straight', 1.5, 2, 0), 'out_of_bounds', before);
    // The hill's 2 × 2 footprint would extend beyond the grid.
    expectRejected(await act(page, 'placePiece', 'hill', 15, 15, 0), 'out_of_bounds', before);
    expectRejected(await act(page, 'placePiece', 'bridge' as PieceType, 2, 2, 0), 'not_found', before);
    expectRejected(await act(page, 'placePiece', 'straight', 2, 2, 45 as Rotation), 'not_found', before);
    expectRejected(await act(page, 'movePiece', 'no-such-piece', 1, 1), 'not_found', before);
    expectRejected(await act(page, 'rotatePiece', 'no-such-piece'), 'not_found', before);
    expectRejected(await act(page, 'removePiece', 'no-such-piece'), 'not_found', before);
    expect(await hook(page, 'getConnections')).toEqual([]);

    // --- Placing tracks: place, then snap when a connection is made. ---
    let out = await act(page, 'placePiece', 'straight', 7, 7, 0);
    expect(out.result).toMatchObject({ ok: true });
    const s1 = out.result.id!;
    expect(out.sounds).toEqual(['place']);
    expect(out.state.pieces).toEqual([{ id: s1, type: 'straight', gridX: 7, gridZ: 7, rotation: 0 }]);
    expect(out.state.isDirty).toBe(true);
    expect(out.connections).toEqual([]);

    out = await act(page, 'placePiece', 'straight', 7, 6, 0);
    const s2 = out.result.id!;
    expect(out.result).toEqual({ ok: true, id: s2 });
    expect([s1]).not.toContain(s2);
    expect(out.sounds).toEqual(['place', 'snap']);
    expect(out.state.pieces).toHaveLength(2);
    expect(out.connections).toEqual([pair(s1, s2)]);

    // No rotation given: auto-adjust turns the curve to 180° (N, W) to meet the straight's open S end.
    out = await act(page, 'placePiece', 'curve', 7, 8);
    const c1 = out.result.id!;
    expect(out.result).toEqual({ ok: true, id: c1 });
    expect(out.sounds).toEqual(['place', 'snap']);
    expect(out.state.pieces.find((p) => p.id === c1)).toEqual({ id: c1, type: 'curve', gridX: 7, gridZ: 8, rotation: 180 });
    expect(out.connections).toEqual(pairs(pair(s1, s2), pair(s1, c1)));
    const trackPairs = out.connections;

    // --- Decorations: on_track and occupied. ---
    before = out.state;
    expectRejected(await act(page, 'placePiece', 'house', 7, 7, 0), 'on_track', before);
    // A hill at (6, 6) would cover (7, 6) and (7, 7), which hold tracks.
    expectRejected(await act(page, 'placePiece', 'hill', 6, 6, 0), 'on_track', before);
    expectRejected(await act(page, 'placePiece', 'straight', 7, 7, 90), 'occupied', before);

    out = await act(page, 'placePiece', 'house', 3, 3, 0);
    const house = out.result.id!;
    expect(out.result).toEqual({ ok: true, id: house });
    expect(out.sounds).toEqual(['place']);
    expect(out.connections).toEqual(trackPairs);

    before = out.state;
    expectRejected(await act(page, 'placePiece', 'pineTree', 3, 3, 0), 'occupied', before);
    expectRejected(await act(page, 'placePiece', 'straight', 3, 3, 0), 'occupied', before);
    // The hill at (2, 2) would cover the house at (3, 3).
    expectRejected(await act(page, 'placePiece', 'hill', 2, 2, 0), 'occupied', before);

    // --- Station limit: one station; station_limit comes before on_track and occupied. ---
    out = await act(page, 'placePiece', 'station', 10, 10, 0);
    const station = out.result.id!;
    expect(out.result).toEqual({ ok: true, id: station });
    expect(out.sounds).toEqual(['place']);
    expect(out.connections).toEqual(trackPairs);

    before = out.state;
    expectRejected(await act(page, 'placePiece', 'station', 12, 12, 0), 'station_limit', before);
    expectRejected(await act(page, 'placePiece', 'station', 7, 7, 0), 'station_limit', before);
    // out_of_bounds comes before station_limit.
    expectRejected(await act(page, 'placePiece', 'station', 16, 0, 0), 'out_of_bounds', before);

    // --- Moving. ---
    expectRejected(await act(page, 'movePiece', house, 7, 7), 'on_track', before);
    expectRejected(await act(page, 'movePiece', house, 15, 16), 'out_of_bounds', before);
    expectRejected(await act(page, 'movePiece', house, 2.5, 1), 'out_of_bounds', before);
    expectRejected(await act(page, 'movePiece', s1, 3, 3), 'occupied', before);
    expectRejected(await act(page, 'movePiece', station, 7, 6), 'occupied', before);

    out = await act(page, 'movePiece', house, 4, 4);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['move']);
    expect(out.state.pieces).toEqual(
      before.pieces.map((p) => (p.id === house ? { ...p, gridX: 4, gridZ: 4 } : p)),
    );
    expect(out.connections).toEqual(trackPairs);

    // A move to the current tile succeeds and changes nothing.
    before = out.state;
    out = await act(page, 'movePiece', house, 4, 4);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['move']);
    expect(out.state.pieces).toEqual(before.pieces);

    // Moving a track away breaks its connection; moving it back snaps again.
    out = await act(page, 'movePiece', s2, 12, 3);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['move']);
    expect(out.state.pieces.find((p) => p.id === s2)).toEqual({ id: s2, type: 'straight', gridX: 12, gridZ: 3, rotation: 0 });
    expect(out.connections).toEqual([pair(s1, c1)]);

    out = await act(page, 'movePiece', s2, 7, 6);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['move', 'snap']);
    expect(out.connections).toEqual(trackPairs);

    // --- Rotating: 90° clockwise each call, keeping the tile. ---
    out = await act(page, 'rotatePiece', s2);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['rotate']);
    expect(out.state.pieces.find((p) => p.id === s2)).toEqual({ id: s2, type: 'straight', gridX: 7, gridZ: 6, rotation: 90 });
    expect(out.connections).toEqual([pair(s1, c1)]);

    out = await act(page, 'rotatePiece', s2);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['rotate', 'snap']);
    expect(out.state.pieces.find((p) => p.id === s2)?.rotation).toBe(180);
    expect(out.connections).toEqual(trackPairs);

    out = await act(page, 'rotatePiece', house);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['rotate']);
    expect(out.state.pieces.find((p) => p.id === house)).toEqual({ id: house, type: 'house', gridX: 4, gridZ: 4, rotation: 90 });

    // --- Removing. ---
    before = out.state;
    out = await act(page, 'removePiece', s2);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['delete']);
    expect(out.state.pieces).toEqual(before.pieces.filter((p) => p.id !== s2));
    expect(out.state.isDirty).toBe(true);
    expect(out.connections).toEqual([pair(s1, c1)]);

    before = out.state;
    expectRejected(await act(page, 'removePiece', s2), 'not_found', before);
    expectRejected(await act(page, 'rotatePiece', s2), 'not_found', before);
    expectRejected(await act(page, 'movePiece', s2, 0, 0), 'not_found', before);

    // --- Play mode: every build action gives play_mode, which comes before every other code. ---
    const play = await act(page, 'setMode', 'play');
    expect(play.result).toEqual({ ok: true });
    expect(play.sounds).toEqual(['whistle', 'chug']);
    expect(play.state.mode).toBe('play');
    expect(play.state.pieces).toEqual(before.pieces);
    expect(play.state.isDirty).toBe(before.isDirty);
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'play');

    before = play.state;
    expectRejected(await act(page, 'placePiece', 'straight', 0, 0, 0), 'play_mode', before);
    expectRejected(await act(page, 'placePiece', 'straight', 99, 0, 0), 'play_mode', before);
    expectRejected(await act(page, 'placePiece', 'station', 12, 12, 0), 'play_mode', before);
    expectRejected(await act(page, 'movePiece', house, 5, 5), 'play_mode', before);
    expectRejected(await act(page, 'movePiece', 'no-such-piece', 5, 5), 'play_mode', before);
    expectRejected(await act(page, 'rotatePiece', s1), 'play_mode', before);
    expectRejected(await act(page, 'rotatePiece', 'no-such-piece'), 'play_mode', before);
    expectRejected(await act(page, 'removePiece', s1), 'play_mode', before);
    expect(await hook(page, 'getConnections')).toEqual([pair(s1, c1)]);

    // Back to Build mode: the train is parked on the station again; nothing else changed.
    const build = await act(page, 'setMode', 'build');
    expect(build.result).toEqual({ ok: true });
    expect(build.sounds.filter((s) => !TRAIN_SOUNDS.has(s))).toEqual([]);
    expect(build.state.mode).toBe('build');
    expect(build.state.pieces).toEqual(before.pieces);
    expect(build.state.isDirty).toBe(before.isDirty);
    expect(build.state.setting).toBe(before.setting);
    expect(build.state.startFacing).toBe(before.startFacing);
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');
    expect(await hook(page, 'getTrain')).toEqual({
      pieceId: station,
      progress: 0.5,
      moving: false,
      direction: 'forward',
      speed: 0,
    });

    // Building works again.
    out = await act(page, 'removePiece', house);
    expect(out.result).toEqual({ ok: true });
    expect(out.sounds).toEqual(['delete']);
  });
});

// ---------------------------------------------------------------------------
// Entering Play mode
// ---------------------------------------------------------------------------

test.describe('entering Play mode', () => {
  test('without a station: no_station, invalid sound, toast, data-mode stays build (hook and toggle)', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    await place(page, 'straight', 5, 5);
    await place(page, 'buffer', 5, 4);
    const before = await getState(page);

    const out = await act(page, 'setMode', 'play');
    expect(out.result).toEqual({ ok: false, reason: 'no_station' });
    expect(out.sounds).toEqual(['invalid']);
    expect(out.state.mode).toBe('build');
    expect(out.state.pieces).toEqual(before.pieces);
    expect(out.state.isDirty).toBe(before.isDirty);
    await expect(byTestId(page, 'toast').filter({ hasText: 'Place a station to start' })).toHaveCount(1);
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');
    expect(await hook(page, 'getTrain')).toBeNull();

    // The Build/Play toggle is rejected the same way.
    const logBefore = (await hook(page, 'getSoundLog')).length;
    await byTestId(page, 'mode-toggle').click();
    await expect(byTestId(page, 'toast').filter({ hasText: 'Place a station to start' }).first()).toBeVisible();
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');
    expect((await getState(page)).mode).toBe('build');
    expect((await hook(page, 'getSoundLog')).slice(logBefore)).toContain('invalid');
    expect(await hook(page, 'getTrain')).toBeNull();
  });

  test('with a station: Auto driving, whistle and chug at once, moving forward within 1 second', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    const station = await place(page, 'station', 7, 7);
    await place(page, 'straight', 7, 6);
    await place(page, 'straight', 7, 8);
    expect(await hook(page, 'getTrain')).toEqual({ pieceId: station, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
    const before = await getState(page);

    await startTrainRecorder(page);
    const play = await enterPlay(page);
    expect(play.result).toEqual({ ok: true });
    expect(play.sounds).toEqual(['whistle', 'chug']);
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'play');
    const state = await getState(page);
    expect(state.mode).toBe('play');
    expect(state.driveMode).toBe('auto');
    expect(state.pieces).toEqual(before.pieces);
    expect(state.isDirty).toBe(before.isDirty);

    await waitForTrain(page, { moving: true, direction: 'forward' });
    const rec = await readRecorder(page);
    const firstMoving = rec.samples.find((s) => s.t >= rec.playAt! && s.moving);
    expect(firstMoving, 'a sample with moving: true').toBeDefined();
    expect(firstMoving!.direction).toBe('forward');
    expect(firstMoving!.t - rec.playAt!).toBeLessThan(1000);

    const build = await act(page, 'setMode', 'build');
    expect(build.result).toEqual({ ok: true });
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');
    expect(await hook(page, 'getTrain')).toEqual({ pieceId: station, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Train motion
// ---------------------------------------------------------------------------

test.describe('train motion through getTrain()', () => {
  test('Auto on a closed loop: cruises at 1.5 tiles/s forward round every piece, never stopping', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    // A 3 × 3 ring on tiles (6..8, 6..8) with the station on its west side.
    const ring = [
      await place(page, 'curve', 6, 6, 0),
      await place(page, 'straight', 7, 6, 90),
      await place(page, 'curve', 8, 6, 90),
      await place(page, 'straight', 8, 7, 0),
      await place(page, 'curve', 8, 8, 180),
      await place(page, 'straight', 7, 8, 90),
      await place(page, 'curve', 6, 8, 270),
      await place(page, 'station', 6, 7, 0),
    ];
    const expected = pairs(...ring.map((id, i) => pair(id, ring[(i + 1) % ring.length]!)));
    expect(await hook(page, 'getConnections')).toEqual(expected);

    await startTrainRecorder(page);
    const play = await enterPlay(page);
    expect(play.result).toEqual({ ok: true });
    const logStart = (await hook(page, 'getSoundLog')).length;

    // Wait until the locomotive has been on every piece of the ring (one lap is about 7.1 tiles, 4.8 s).
    await page.waitForFunction(
      (n) => {
        const rec = (window as unknown as { __e2eTrain: Recorder }).__e2eTrain;
        return new Set(rec.samples.map((s) => s.pieceId)).size >= n;
      },
      ring.length,
      { timeout: 25_000 },
    );

    const rec = await readRecorder(page);
    const samples = rec.samples.filter((s) => s.t >= rec.playAt!);
    const cruiseFrom = samples.findIndex((s) => s.speed === 1.5);
    expect(cruiseFrom, 'the train reaches cruise speed').toBeGreaterThanOrEqual(0);
    const cruising = samples.slice(cruiseFrom);
    expect(cruising.length).toBeGreaterThan(10);
    for (const s of cruising) {
      expect(s).toMatchObject({ moving: true, direction: 'forward', speed: 1.5 });
      expect(ring).toContain(s.pieceId);
      expect(s.progress).toBeGreaterThanOrEqual(0);
      expect(s.progress).toBeLessThanOrEqual(1);
    }
    for (const s of samples) expect(s.speed).toBeLessThanOrEqual(1.5);
    expect(new Set(samples.map((s) => s.pieceId))).toEqual(new Set(ring));
    expect((await hook(page, 'getSoundLog')).slice(logStart)).not.toContain('bump');
    expect(await hook(page, 'getTrain')).toMatchObject({ moving: true, direction: 'forward', speed: 1.5 });

    expect((await hook(page, 'setMode', 'build')).ok).toBe(true);
    expect(await hook(page, 'getTrain')).toEqual({ pieceId: ring[7], progress: 0.5, moving: false, direction: 'forward', speed: 0 });
  });

  test('Auto on a dead-end line: eases to a stop with a bump, pauses 1 second, then runs in reverse', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    // North to south on column 7: buffer stop, 2 straights, station, 4 straights.
    const buffer = await place(page, 'buffer', 7, 3);
    const line = [buffer];
    for (const z of [4, 5]) line.push(await place(page, 'straight', 7, z));
    const station = await place(page, 'station', 7, 6);
    line.push(station);
    for (const z of [7, 8, 9, 10]) line.push(await place(page, 'straight', 7, z));
    expect(await hook(page, 'getConnections')).toEqual(pairs(...line.slice(1).map((id, i) => pair(line[i]!, id))));

    await startTrainRecorder(page);
    const play = await enterPlay(page);
    expect(play.result).toEqual({ ok: true });
    expect(play.sounds).toEqual(['whistle', 'chug']);
    const logStart = (await hook(page, 'getSoundLog')).length;

    // Forward to the buffer stop, then (after the pause) in reverse.
    await page.waitForFunction((n) => window.__DIORAMA__!.getSoundLog().length > n && window.__DIORAMA__!.getSoundLog().slice(n).includes('bump'), logStart, { timeout: 15_000 });
    await waitForTrain(page, { moving: true, direction: 'reverse' });
    await waitForTrain(page, { direction: 'reverse', minSpeed: 1.5 });

    const rec = await readRecorder(page);
    const samples = rec.samples.filter((s) => s.t >= rec.playAt!);
    const firstMove = samples.findIndex((s) => s.moving);
    expect(firstMove).toBeGreaterThanOrEqual(0);
    const arrival = samples.findIndex((s, i) => i > firstMove && !s.moving);
    expect(arrival, 'the train stops at the buffer').toBeGreaterThan(firstMove);
    const departure = samples.findIndex((s, i) => i > arrival && s.moving);
    expect(departure, 'the train departs again').toBeGreaterThan(arrival);

    // Forward run: cruise at 1.5, never faster; the speed never rises again once braking starts.
    const run = samples.slice(firstMove, arrival + 1);
    expect(run.every((s) => s.direction === 'forward')).toBe(true);
    expect(run.some((s) => s.speed === 1.5)).toBe(true);
    for (const s of run) expect(s.speed).toBeLessThanOrEqual(1.5);
    const peak = run.findLastIndex((s) => s.speed === 1.5);
    for (let i = peak + 1; i < run.length; i++) expect(run[i]!.speed).toBeLessThanOrEqual(run[i - 1]!.speed);

    // Stopped at the buffer stop, held still, facing the same way.
    expect(samples[arrival]!.pieceId).toBe(buffer);
    const pause = samples.slice(arrival, departure);
    for (const s of pause) expect(s).toMatchObject({ moving: false, speed: 0, direction: 'forward', pieceId: buffer });
    const pauseMs = samples[departure]!.t - samples[arrival]!.t;
    expect(pauseMs).toBeGreaterThanOrEqual(900);
    expect(pauseMs).toBeLessThanOrEqual(1000 + 2 * SLACK_MS);

    // Then reverse, back up to 1.5 tiles/s.
    expect(samples[departure]!.direction).toBe('reverse');
    expect(samples.slice(departure).every((s) => s.direction === 'reverse' || !s.moving)).toBe(true);
    expect(samples.slice(departure).some((s) => s.speed === 1.5 && s.direction === 'reverse')).toBe(true);

    // Sounds: one bump at the buffer, and the chug started again for the reverse run.
    const log = (await hook(page, 'getSoundLog')).slice(logStart);
    expect(log[0]).toBe('bump');
    expect(log).toContain('chug');

    expect((await hook(page, 'setMode', 'build')).ok).toBe(true);
    expect(await hook(page, 'getTrain')).toEqual({ pieceId: station, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
  });

  test('Manual driving: W drives forward and S in reverse, up to 2 tiles/s; releasing stops the train', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    // A long straight line on column 7 (z 1 to 14) with the station in the middle.
    let station = '';
    for (let z = 1; z <= 14; z++) {
      const id = await place(page, z === 7 ? 'station' : 'straight', 7, z);
      if (z === 7) station = id;
    }

    await startTrainRecorder(page);
    const play = await enterPlay(page, 'manual');
    expect(play.result).toEqual({ ok: true });
    expect((await getState(page)).driveMode).toBe('manual');
    // With no key held, Manual driving keeps the train still.
    await page.waitForTimeout(300);
    expect(await hook(page, 'getTrain')).toMatchObject({ moving: false, speed: 0, pieceId: station });

    await focusPage(page);

    // Hold W: forward, reaching 2 tiles/s within about 1 second.
    await page.keyboard.down('w');
    await waitForTrain(page, { moving: true, direction: 'forward', minSpeed: 2 }, 10_000);
    await page.keyboard.up('w');
    await waitForTrain(page, { moving: false });

    // Hold S: reverse.
    await page.keyboard.down('s');
    await waitForTrain(page, { moving: true, direction: 'reverse', minSpeed: 2 }, 10_000);
    await page.keyboard.up('s');
    await waitForTrain(page, { moving: false });
    // Let a few more frames record the stopped train.
    await page.waitForTimeout(200);

    const rec = await readRecorder(page);
    const keyTime = (type: KeySample['type'], key: string) => {
      const k = rec.keys.find((e) => e.type === type && e.key.toLowerCase() === key);
      expect(k, `${type} ${key} reached the page`).toBeDefined();
      return k!.t;
    };
    const wDown = keyTime('keydown', 'w');
    const wUp = keyTime('keyup', 'w');
    const sDown = keyTime('keydown', 's');
    const sUp = keyTime('keyup', 's');

    for (const [down, up, direction] of [
      [wDown, wUp, 'forward'],
      [sDown, sUp, 'reverse'],
    ] as const) {
      const held = rec.samples.filter((s) => s.t >= down && s.t <= up);
      const top = held.find((s) => s.speed >= 2);
      expect(top, `${direction}: reaches 2 tiles/s`).toBeDefined();
      expect(top!.t - down).toBeLessThanOrEqual(1000 + SLACK_MS);
      for (const s of held) {
        expect(s.speed).toBeLessThanOrEqual(2);
        if (s.moving) expect(s.direction).toBe(direction);
      }
      const stopped = rec.samples.find((s) => s.t > up && !s.moving);
      expect(stopped, `${direction}: stops after release`).toBeDefined();
      expect(stopped!.speed).toBe(0);
      expect(stopped!.t - up).toBeLessThanOrEqual(500 + SLACK_MS);
      // Coasting to the stop keeps the direction.
      for (const s of rec.samples.filter((x) => x.t > up && x.t < stopped!.t)) expect(s.direction).toBe(direction);
    }

    // The train moved off the station and came back past it on the reverse run.
    expect(new Set(rec.samples.map((s) => s.pieceId)).size).toBeGreaterThan(1);
    expect(await hook(page, 'getTrain')).toMatchObject({ moving: false, speed: 0, direction: 'reverse' });

    expect((await hook(page, 'setMode', 'build')).ok).toBe(true);
    expect(await hook(page, 'getTrain')).toEqual({ pieceId: station, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
  });
});
