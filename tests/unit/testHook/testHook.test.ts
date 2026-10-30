/**
 * Unit tests for the test hook and the train runtime working together (task 11.5).
 *
 * Requirements 17.9, 18.5, 39.1, 39.8, 39.9, 39.14 and 39.20.
 *
 * `installTestHook.test.ts` (task 11.3) covers installation, copies, the
 * debug helper and the hook ↔ store equivalence; `runtime/TrainRuntime.test.ts`
 * (task 11.1) covers the runtime on its own. This file drives the hook built
 * by `createTestHook` against the store harness: a real store, the real
 * `TrainRuntime` behind the store's train port, a recording audio port and a
 * manual clock. It checks the contract end to end: the store → train runtime →
 * audio path, and the hook's view of it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { connectorsOf, dirDelta } from '@/domain/connectors';
import type { Piece, Rotation } from '@/domain/types';
import { TOAST_NO_STATION } from '@/store/createAppStore';
import { createTestHook, type DioramaTestHook } from '@/testHook/installTestHook';
import { createHarness, disposeHarnesses, type Harness } from '../store/harness';

afterEach(() => disposeHarnesses());

const FRAME = 1 / 60;
const PARKED = { progress: 0.5, moving: false, direction: 'forward', speed: 0 } as const;

const METHODS = [
  'getState',
  'placePiece',
  'movePiece',
  'rotatePiece',
  'removePiece',
  'getConnections',
  'setMode',
  'setDriveMode',
  'getTrain',
  'getSoundLog',
] as const;

interface Env extends Harness {
  hook: DioramaTestHook;
  /** The hook with loosely typed arguments, for calls the contract types forbid. */
  loose: Record<string, (...args: unknown[]) => unknown>;
}

function setup(): Env {
  const h = createHarness({ start: 'playfield' });
  const hook = createTestHook({ store: h.store, audio: h.audio, train: h.train });
  return { ...h, hook, loose: hook as unknown as Env['loose'] };
}

function ticks(env: Env, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / FRAME); i++) env.tick(FRAME);
}

function countOf(log: readonly string[], name: string): number {
  return log.filter((e) => e === name).length;
}

/** A closed 4 × 4 rectangle (columns 4 to 7, rows 4 to 7) with the station on the west side. */
function placeLoop(hook: DioramaTestHook): string {
  const parts: Array<[Piece['type'], number, number, Rotation]> = [
    ['curve', 4, 4, 0],
    ['straight', 5, 4, 90],
    ['straight', 6, 4, 90],
    ['curve', 7, 4, 90],
    ['straight', 7, 5, 0],
    ['straight', 7, 6, 0],
    ['curve', 7, 7, 180],
    ['straight', 6, 7, 90],
    ['straight', 5, 7, 90],
    ['curve', 4, 7, 270],
    ['straight', 4, 6, 0],
  ];
  for (const [type, x, z, r] of parts) expect(hook.placePiece(type, x, z, r).ok).toBe(true);
  const station = hook.placePiece('station', 4, 5, 0);
  expect(station.ok).toBe(true);
  expect(hook.getConnections()).toHaveLength(12);
  return station.id!;
}

describe('the hook object (Requirement 39.1)', () => {
  it('has exactly the 10 contract methods, frozen, each returning a non-thenable value', () => {
    const t = setup();
    expect(Object.keys(t.hook).sort()).toEqual([...METHODS].sort());
    expect(Object.isFrozen(t.hook)).toBe(true);

    const { id } = t.hook.placePiece('station', 4, 4, 0);
    const results: unknown[] = [
      t.hook.getState(),
      t.hook.placePiece('straight', 4, 3),
      t.hook.movePiece(id!, 4, 6),
      t.hook.rotatePiece(id!),
      t.hook.removePiece('nope'),
      t.hook.getConnections(),
      t.hook.setDriveMode('manual'),
      t.hook.getTrain(),
      t.hook.getSoundLog(),
      t.hook.setMode('play'),
      t.hook.getTrain(),
      t.hook.setMode('build'),
    ];
    for (const v of results) {
      expect(v).not.toBeInstanceOf(Promise);
      const then = v !== null && typeof v === 'object' ? (v as { then?: unknown }).then : undefined;
      expect(then).toBeUndefined();
    }
    // setDriveMode is declared `void`.
    expect(results[6]).toBeUndefined();
  });
});

describe('placePiece with a bad type or rotation (Requirement 39.8)', () => {
  const badTypes: unknown[] = ['rocket', 'Straight', 'pine-tree', '', null, undefined, 3, {}];
  const badRotations: unknown[] = [45, 360, -90, 90.5, '90', null, NaN, Infinity, true];

  it('returns not_found, logs invalid and leaves pieces, isDirty and history unchanged', () => {
    const t = setup();
    for (const type of badTypes) {
      expect(t.loose.placePiece!(type, 3, 3)).toEqual({ ok: false, reason: 'not_found' });
    }
    for (const rotation of badRotations) {
      expect(t.loose.placePiece!('straight', 3, 3, rotation)).toEqual({ ok: false, reason: 'not_found' });
      expect(t.loose.placePiece!('house', 3, 3, rotation)).toEqual({ ok: false, reason: 'not_found' });
    }
    const failures = badTypes.length + 2 * badRotations.length;
    expect(t.hook.getSoundLog()).toEqual(Array(failures).fill('invalid'));
    expect(t.hook.getState().pieces).toEqual([]);
    expect(t.hook.getState().isDirty).toBe(false);
    expect(t.store.getState().history.past).toEqual([]);
  });

  it('not_found wins over the later reason codes but loses to play_mode', () => {
    const t = setup();
    t.hook.placePiece('station', 4, 4, 0);
    t.hook.placePiece('house', 8, 8, 0);
    // Would also be out_of_bounds, occupied or a second station.
    expect(t.loose.placePiece!('rocket', 99, -1)).toEqual({ ok: false, reason: 'not_found' });
    expect(t.loose.placePiece!('station', 9, 9, 45)).toEqual({ ok: false, reason: 'not_found' });
    expect(t.loose.placePiece!('straight', 8, 8, 1)).toEqual({ ok: false, reason: 'not_found' });

    expect(t.hook.setMode('play')).toEqual({ ok: true });
    expect(t.loose.placePiece!('rocket', 1, 1)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.loose.placePiece!('house', 1, 1, 45)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.hook.getState().pieces).toHaveLength(2);
  });

  it('every valid rotation is accepted as given', () => {
    const t = setup();
    for (const [i, r] of ([0, 90, 180, 270] as const).entries()) {
      const res = t.hook.placePiece('house', i * 2, 0, r);
      expect(res.ok).toBe(true);
      expect(t.hook.getState().pieces.find((p) => p.id === res.id)?.rotation).toBe(r);
    }
  });
});

describe("setMode('play') without a station (Requirement 39.9)", () => {
  it('returns no_station, logs invalid, toasts and never starts the train', () => {
    const t = setup();
    t.hook.placePiece('straight', 4, 4, 0);
    t.hook.placePiece('straight', 4, 5, 0);
    t.hook.placePiece('house', 9, 9, 0);
    const before = t.hook.getState();
    t.audio.clearLog();

    expect(t.hook.setMode('play')).toEqual({ ok: false, reason: 'no_station' });
    expect(t.hook.getSoundLog()).toEqual(['invalid']);
    expect(t.store.getState().toasts.map((x) => x.text)).toEqual([TOAST_NO_STATION]);
    expect(t.hook.getState()).toEqual(before);
    expect(t.trainCalls.filter((c) => c.method === 'enterPlay')).toEqual([]);
    expect(t.train.isPlaying()).toBe(false);
    expect(t.hook.getTrain()).toBeNull();
  });

  it('also refuses after the only station was removed', () => {
    const t = setup();
    const { id } = t.hook.placePiece('station', 4, 4, 0);
    expect(t.hook.removePiece(id!)).toEqual({ ok: true });
    t.audio.clearLog();
    expect(t.hook.setMode('play')).toEqual({ ok: false, reason: 'no_station' });
    expect(t.hook.getState().mode).toBe('build');
    expect(t.hook.getSoundLog()).toEqual(['invalid']);
  });
});

describe('getTrain (Requirements 17.9, 39.14, 39.20)', () => {
  it('is null without a station, including after the station is deleted or undone', () => {
    const t = setup();
    expect(t.hook.getTrain()).toBeNull();
    t.hook.placePiece('straight', 4, 4, 0);
    expect(t.hook.getTrain()).toBeNull();

    const { id } = t.hook.placePiece('station', 4, 5, 0);
    expect(t.hook.getTrain()).toEqual({ pieceId: id, ...PARKED });
    t.hook.removePiece(id!);
    expect(t.hook.getTrain()).toBeNull();
    // startFacing is kept while there is no station (Requirement 17.9).
    expect(t.hook.getState().startFacing).toBe(0);

    expect(t.store.getState().undo()).toBe(true);
    expect(t.hook.getTrain()).toEqual({ pieceId: id, ...PARKED });
    expect(t.store.getState().undo()).toBe(true);
    expect(t.hook.getTrain()).toBeNull();
  });

  it('reports the parked values in Build mode for every station rotation, tile and start facing', () => {
    const t = setup();
    const { id } = t.hook.placePiece('station', 6, 6, 0);
    for (const facing of [0, 180] as const) {
      if (t.hook.getState().startFacing !== facing) expect(t.store.getState().flipStartFacing()).toBe(true);
      for (let r = 0; r < 4; r++) {
        expect(t.hook.getTrain()).toEqual({ pieceId: id, ...PARKED });
        // The locomotive faces the station's rotated connector 0 (facing 0) or 1 (facing 180).
        const station = t.hook.getState().pieces[0]!;
        const want = dirDelta(connectorsOf(station)[facing === 0 ? 0 : 1]!);
        const loco = t.train.poses()![0]!;
        expect(loco.tangent.x).toBeCloseTo(want.dx);
        expect(loco.tangent.z).toBeCloseTo(want.dz);
        t.hook.rotatePiece(id!);
      }
    }
    expect(t.hook.movePiece(id!, 0, 15)).toEqual({ ok: true });
    expect(t.hook.getTrain()).toEqual({ pieceId: id, ...PARKED });
  });

  it('returns to the parked values after Play mode (Requirement 18.5)', () => {
    const t = setup();
    const stationId = placeLoop(t.hook);
    t.store.getState().flipStartFacing();
    expect(t.hook.setMode('play')).toEqual({ ok: true });
    ticks(t, 3);
    const running = t.hook.getTrain()!;
    expect(running.moving).toBe(true);
    expect(running.pieceId).not.toBe(stationId);

    expect(t.hook.setMode('build')).toEqual({ ok: true });
    expect(t.hook.getTrain()).toEqual({ pieceId: stationId, ...PARKED });
    expect(t.hook.getState().startFacing).toBe(180);
    // Frames in Build mode do not move the parked train.
    ticks(t, 1);
    expect(t.hook.getTrain()).toEqual({ pieceId: stationId, ...PARKED });
  });
});

describe('chug forwarding through the store (Requirement 18.5, D-33)', () => {
  it('logs chug once per start and stops it on exitPlay', () => {
    const t = setup();
    placeLoop(t.hook);
    t.audio.clearLog();

    expect(t.hook.setMode('play')).toEqual({ ok: true });
    // startPlay emits whistle and chugStart straight away.
    expect(t.hook.getSoundLog()).toEqual(['whistle', 'chug']);
    expect(t.audio.chugRunning).toBe(true);

    ticks(t, 10); // a closed loop never stops, so no second start
    expect(t.hook.getSoundLog()).toEqual(['whistle', 'chug']);
    expect(t.audio.chugLevel).toBeCloseTo(1.5); // speed in tiles per second (D-32)

    expect(t.hook.setMode('build')).toEqual({ ok: true });
    expect(t.audio.chugRunning).toBe(false);
    expect(t.trainCalls.map((c) => c.method)).toEqual(['enterPlay', 'exitPlay']);
    ticks(t, 1);
    expect(t.hook.getSoundLog()).toEqual(['whistle', 'chug']);

    // Each new Play session starts the chug once more.
    expect(t.hook.setMode('play')).toEqual({ ok: true });
    expect(countOf(t.hook.getSoundLog(), 'chug')).toBe(2);
    expect(t.audio.chugRunning).toBe(true);
    t.hook.setMode('build');
    expect(t.audio.chugRunning).toBe(false);
  });

  it('a stop and restart in Manual mode logs one chug per departure', () => {
    const t = setup();
    placeLoop(t.hook);
    t.hook.setMode('play');
    t.hook.setDriveMode('manual');
    ticks(t, 0.5); // no key: brakes to a stop
    expect(t.hook.getTrain()!.moving).toBe(false);
    expect(t.audio.chugRunning).toBe(false);

    t.train.setKeys({ w: true });
    ticks(t, 0.5);
    expect(t.hook.getTrain()!.moving).toBe(true);
    expect(t.audio.chugRunning).toBe(true);
    expect(countOf(t.hook.getSoundLog(), 'chug')).toBe(2);
    ticks(t, 2);
    expect(countOf(t.hook.getSoundLog(), 'chug')).toBe(2);
  });

  it('a lone station bumps, stops the chug and then stays silent', () => {
    const t = setup();
    t.hook.placePiece('station', 8, 8, 0);
    t.audio.clearLog();
    t.hook.setMode('play');
    ticks(t, 5);
    const log = t.hook.getSoundLog();
    expect(countOf(log, 'chug')).toBe(1);
    expect(countOf(log, 'bump')).toBe(1);
    expect(t.audio.chugRunning).toBe(false);
    expect(t.hook.getTrain()).toMatchObject({ moving: false, speed: 0 });
    t.hook.setMode('build');
    expect(t.hook.getTrain()).toEqual({ pieceId: t.hook.getState().pieces[0]!.id, ...PARKED });
  });

  it('the sound log keeps whistle and chug while muted', () => {
    const t = setup();
    placeLoop(t.hook);
    t.store.getState().setMuted(true);
    t.audio.clearLog();
    t.hook.setMode('play');
    expect(t.hook.getSoundLog()).toEqual(['whistle', 'chug']);
    expect(t.audio.chugRunning).toBe(true);
  });
});
