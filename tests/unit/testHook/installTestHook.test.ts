/**
 * Unit tests for the `window.__DIORAMA__` test hook (task 11.3).
 *
 * Requirements 38.1 to 38.5 and 39.1 to 39.20. The store, the train runtime
 * and the placement engine are real; only the audio port (a recorder),
 * storage (in memory), timers and the scene are fakes. The hook is installed
 * on a plain object instead of `window`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AudioPort } from '@/audio/types';
import type { AudioSettings, SoundEvent } from '@/domain/types';
import { createSaveRepository } from '@/persistence/saveRepository';
import { createSettingsRepository } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import { TrainRuntime } from '@/runtime/TrainRuntime';
import { TOAST_NO_STATION, createAppStore, type AppStore } from '@/store/createAppStore';
import type { AppDeps, Timers } from '@/store/ports';
import {
  installTestHook,
  shouldInstallTestHook,
  type DioramaTestHook,
  type HookTarget,
} from '@/testHook/installTestHook';

class RecordingAudio implements AudioPort {
  log: SoundEvent[] = [];
  play(e: Exclude<SoundEvent, 'chug'>): void {
    this.log.push(e);
  }
  startChug(): void {
    this.log.push('chug');
  }
  setChugLevel(): void {}
  stopChug(): void {}
  apply(_s: AudioSettings): void {}
  getLog(): SoundEvent[] {
    return [...this.log];
  }
}

const idleTimers: Timers = {
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
};

const stores: AppStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.getState().dispose();
});

function makeStore() {
  const storage = memoryStorage();
  const audio = new RecordingAudio();
  const train = new TrainRuntime(audio);
  let n = 0;
  const deps: AppDeps = {
    audio,
    train,
    scene: { captureThumbnail: () => null, resetView: () => {} },
    saves: createSaveRepository({
      storage,
      now: () => new Date('2026-10-29T10:00:00.000Z'),
      newId: () => 'd1',
      warn: () => {},
    }),
    settings: createSettingsRepository({ storage, warn: () => {} }),
    now: () => Date.parse('2026-10-29T10:00:00.000Z'),
    newId: () => `p${++n}`,
    timers: idleTimers,
    warn: () => {},
  };
  const store = createAppStore(deps);
  stores.push(store);
  train.connect(() => store.getState());
  store.getState().newDiorama();
  return { store, audio, train };
}

type TileToScreen = (x: number, z: number) => { x: number; y: number } | null;

function setup(tileToScreen: TileToScreen = (x, z) => ({ x: x * 10, y: z * 10 })) {
  const env = makeStore();
  const target: HookTarget = {};
  const uninstall = installTestHook({ ...env, scene: { tileToScreen }, target });
  const hook = target.__DIORAMA__ as DioramaTestHook;
  return { ...env, target, uninstall, hook };
}

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

const GAME_STATE_KEYS = [
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
].sort();

describe('shouldInstallTestHook', () => {
  it('installs in development mode whatever the URL', () => {
    expect(shouldInstallTestHook({ search: '' }, { DEV: true })).toBe(true);
    expect(shouldInstallTestHook({ search: '?test=0' }, { DEV: true })).toBe(true);
  });

  it('installs in production only with test=1 in the query string', () => {
    expect(shouldInstallTestHook({ search: '?test=1' }, { DEV: false })).toBe(true);
    expect(shouldInstallTestHook({ search: '?a=b&test=1' }, { DEV: false })).toBe(true);
    expect(shouldInstallTestHook({ search: '' }, { DEV: false })).toBe(false);
    expect(shouldInstallTestHook({ search: '?test=0' }, {})).toBe(false);
    expect(shouldInstallTestHook({ search: '?test=true' }, {})).toBe(false);
    expect(shouldInstallTestHook({ search: '?testing=1' }, {})).toBe(false);
  });

  it('never throws on missing inputs', () => {
    expect(shouldInstallTestHook(null, null)).toBe(false);
    expect(shouldInstallTestHook(undefined, undefined)).toBe(false);
  });
});

describe('installTestHook', () => {
  it('installs all 10 methods as functions and the debug helper', () => {
    const t = setup();
    expect(Object.keys(t.hook).sort()).toEqual([...METHODS].sort());
    for (const m of METHODS) expect(typeof t.hook[m]).toBe('function');
    expect(typeof t.target.__DIORAMA_DEBUG__?.tileToScreen).toBe('function');
  });

  it('returns non-Promise values from every method, and methods work unbound', () => {
    const t = setup();
    const { placePiece, getState, getConnections, getTrain, getSoundLog, setMode, setDriveMode } = t.hook;
    const values = [
      getState(),
      placePiece('station', 4, 4),
      t.hook.movePiece('nope', 1, 1),
      t.hook.rotatePiece('nope'),
      t.hook.removePiece('nope'),
      getConnections(),
      setMode('build'),
      setDriveMode('auto'),
      getTrain(),
      getSoundLog(),
    ];
    for (const v of values) expect(v).not.toBeInstanceOf(Promise);
  });

  it('uninstall removes both globals, but not ones replaced since', () => {
    const t = setup();
    t.uninstall();
    expect(t.target.__DIORAMA__).toBeUndefined();
    expect(t.target.__DIORAMA_DEBUG__).toBeUndefined();

    const env = makeStore();
    const target: HookTarget = {};
    const first = installTestHook({ ...env, scene: { tileToScreen: () => null }, target });
    installTestHook({ ...env, scene: { tileToScreen: () => null }, target });
    const second = target.__DIORAMA__;
    first();
    expect(target.__DIORAMA__).toBe(second);
  });

  it('keeps the same hook across menu and playfield navigation', () => {
    const t = setup();
    const hook = t.target.__DIORAMA__;
    t.store.getState().backToMenu();
    t.store.getState().newDiorama();
    t.store.getState().backToMenu();
    expect(t.target.__DIORAMA__).toBe(hook);
  });
});

describe('getState', () => {
  it('returns exactly the Section 9 GameState fields', () => {
    const t = setup();
    const s = t.hook.getState();
    expect(Object.keys(s).sort()).toEqual(GAME_STATE_KEYS);
    expect(s).toEqual({
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

  it('is a deep copy: mutating it never changes the store', () => {
    const t = setup();
    t.hook.placePiece('straight', 3, 3);
    const s = t.hook.getState();
    expect(s.pieces).not.toBe(t.store.getState().pieces);
    s.pieces[0]!.gridX = 9;
    s.pieces.push({ id: 'x', type: 'house', gridX: 0, gridZ: 0, rotation: 0 });
    s.mode = 'play';
    expect(t.store.getState().pieces).toEqual([{ id: 'p1', type: 'straight', gridX: 3, gridZ: 3, rotation: 0 }]);
    expect(t.store.getState().mode).toBe('build');
    expect(t.hook.getState().pieces).toHaveLength(1);
  });

  it('reflects every earlier hook call (Requirement 39.2)', () => {
    const t = setup();
    const r = t.hook.placePiece('house', 2, 2);
    expect(t.hook.getState().pieces.map((p) => p.id)).toEqual([r.id]);
    expect(t.hook.getState().isDirty).toBe(true);
  });
});

describe('build methods', () => {
  it('placePiece returns { ok, id } and logs place; a connection adds snap', () => {
    const t = setup();
    expect(t.hook.placePiece('straight', 5, 5, 0)).toEqual({ ok: true, id: 'p1' });
    expect(t.hook.placePiece('straight', 5, 6, 0)).toEqual({ ok: true, id: 'p2' });
    expect(t.hook.getSoundLog()).toEqual(['place', 'place', 'snap']);
    expect(t.hook.getConnections()).toEqual([['p1', 'p2']]);
  });

  it('placePiece without a rotation applies auto-adjust; with one, uses it as is', () => {
    const t = setup();
    t.hook.placePiece('straight', 5, 5, 90); // open ends face W and E
    const auto = t.hook.placePiece('straight', 6, 5);
    const fixed = t.hook.placePiece('straight', 4, 5, 0);
    const pieces = t.hook.getState().pieces;
    expect(pieces.find((p) => p.id === auto.id)?.rotation).toBe(90);
    expect(pieces.find((p) => p.id === fixed.id)?.rotation).toBe(0);
  });

  it('movePiece keeps the rotation and returns { ok: true } without an id', () => {
    const t = setup();
    const { id } = t.hook.placePiece('curve', 1, 1, 270);
    expect(t.hook.movePiece(id!, 2, 3)).toEqual({ ok: true });
    expect(t.hook.getState().pieces[0]).toEqual({ id, type: 'curve', gridX: 2, gridZ: 3, rotation: 270 });
    expect(t.hook.movePiece(id!, 2, 3)).toEqual({ ok: true }); // same tile: no-op success
    expect(t.hook.getSoundLog()).toEqual(['place', 'move', 'move']);
  });

  it('rotatePiece turns 90° clockwise and removePiece deletes', () => {
    const t = setup();
    const { id } = t.hook.placePiece('house', 1, 1, 270);
    expect(t.hook.rotatePiece(id!)).toEqual({ ok: true });
    expect(t.hook.getState().pieces[0]!.rotation).toBe(0);
    expect(t.hook.removePiece(id!)).toEqual({ ok: true });
    expect(t.hook.getState().pieces).toEqual([]);
    expect(t.hook.getSoundLog()).toEqual(['place', 'rotate', 'delete']);
  });

  it('returns reason codes with invalid and leaves pieces unchanged', () => {
    const t = setup();
    t.hook.placePiece('station', 4, 4, 0);
    t.hook.placePiece('house', 8, 8);
    const before = t.hook.getState().pieces;
    const log = t.hook.getSoundLog().length;
    expect(t.hook.placePiece('station', 1, 1)).toEqual({ ok: false, reason: 'station_limit' });
    expect(t.hook.placePiece('house', 4, 4)).toEqual({ ok: false, reason: 'on_track' });
    expect(t.hook.placePiece('straight', 8, 8)).toEqual({ ok: false, reason: 'occupied' });
    expect(t.hook.placePiece('hill', 15, 3)).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(t.hook.movePiece('missing', 1, 1)).toEqual({ ok: false, reason: 'not_found' });
    expect(t.hook.getState().pieces).toEqual(before);
    expect(t.hook.getSoundLog().slice(log)).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
  });

  it('rejects every build call in Play mode with play_mode', () => {
    const t = setup();
    const { id } = t.hook.placePiece('station', 4, 4, 0);
    expect(t.hook.setMode('play')).toEqual({ ok: true });
    expect(t.hook.placePiece('house', 1, 1)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.hook.movePiece(id!, 1, 1)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.hook.rotatePiece(id!)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.hook.removePiece(id!)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.hook.getState().pieces).toHaveLength(1);
  });
});

describe('bad input never throws', () => {
  const junk: unknown[] = [undefined, null, NaN, Infinity, -1, 1.5, '3', {}, [], () => 1, Symbol('s'), 10n];

  it('turns bad types, rotations, coordinates and ids into reasons', () => {
    const t = setup();
    const h = t.hook as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(h.placePiece!('rocket', 1, 1)).toEqual({ ok: false, reason: 'not_found' });
    expect(h.placePiece!('house', 1, 1, 45)).toEqual({ ok: false, reason: 'not_found' });
    expect(h.placePiece!('house', 1, 1, '90')).toEqual({ ok: false, reason: 'not_found' });
    expect(h.placePiece!('house', 1.5, 1)).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(h.placePiece!('house', 16, 0)).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(h.placePiece!('house', '1', 1)).toEqual({ ok: false, reason: 'out_of_bounds' });
    for (const v of junk) {
      expect(() => h.placePiece!(v, v, v, v)).not.toThrow();
      expect(() => h.placePiece!('house', v, v)).not.toThrow();
      expect(() => h.movePiece!(v, v, v)).not.toThrow();
      expect(() => h.rotatePiece!(v)).not.toThrow();
      expect(() => h.removePiece!(v)).not.toThrow();
      expect(() => h.setMode!(v)).not.toThrow();
      expect(() => h.setDriveMode!(v)).not.toThrow();
      expect(() => t.target.__DIORAMA_DEBUG__!.tileToScreen(v as number, v as number)).not.toThrow();
      expect((h.rotatePiece!(v) as { ok: boolean }).ok).toBe(false);
    }
    expect(t.hook.getState().pieces).toEqual([]);
  });

  it('setMode with an unknown mode gives not_found; setDriveMode ignores unknown values', () => {
    const t = setup();
    const h = t.hook as unknown as Record<string, (...a: unknown[]) => unknown>;
    expect(h.setMode!('pause')).toEqual({ ok: false, reason: 'not_found' });
    h.setDriveMode!('turbo');
    expect(t.hook.getState().driveMode).toBe('auto');
  });
});

describe('modes, drive mode and the train', () => {
  it('setMode(play) without a station: no_station, invalid, toast, mode stays build', () => {
    const t = setup();
    expect(t.hook.setMode('play')).toEqual({ ok: false, reason: 'no_station' });
    expect(t.hook.getState().mode).toBe('build');
    expect(t.hook.getSoundLog()).toEqual(['invalid']);
    expect(t.store.getState().toasts.map((x) => x.text)).toEqual([TOAST_NO_STATION]);
  });

  it('getTrain is null without a station and parked in Build mode', () => {
    const t = setup();
    expect(t.hook.getTrain()).toBeNull();
    const { id } = t.hook.placePiece('station', 4, 4, 90);
    expect(t.hook.getTrain()).toEqual({ pieceId: id, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
  });

  it('Play mode starts the train in auto; Build mode parks it again', () => {
    const t = setup();
    const { id } = t.hook.placePiece('station', 4, 4, 0);
    t.hook.placePiece('straight', 4, 3);
    t.hook.setDriveMode('manual');
    expect(t.hook.getState().driveMode).toBe('manual');
    expect(t.hook.setMode('play')).toEqual({ ok: true });
    expect(t.hook.getState()).toMatchObject({ mode: 'play', driveMode: 'auto' });
    t.train.tick(0.1);
    t.train.tick(0.1);
    const moving = t.hook.getTrain()!;
    expect(moving.moving).toBe(true);
    expect(moving.direction).toBe('forward');
    expect(moving.speed).toBeGreaterThan(0);
    expect(t.hook.getSoundLog()).toContain('whistle');
    expect(t.hook.getSoundLog()).toContain('chug');
    expect(t.hook.setMode('build')).toEqual({ ok: true });
    expect(t.hook.getTrain()).toEqual({ pieceId: id, progress: 0.5, moving: false, direction: 'forward', speed: 0 });
  });

  it('setDriveMode sets driveMode in any mode (Requirement 39.11)', () => {
    const t = setup();
    t.hook.setDriveMode('manual');
    expect(t.hook.getState().driveMode).toBe('manual');
    t.hook.setDriveMode('auto');
    expect(t.hook.getState().driveMode).toBe('auto');
  });
});

describe('copies of derived values', () => {
  it('getConnections, getTrain and getSoundLog return fresh copies', () => {
    const t = setup();
    t.hook.placePiece('station', 4, 4, 0);
    t.hook.placePiece('straight', 4, 5, 0);
    const pairs = t.hook.getConnections();
    pairs[0]![0] = 'zzz';
    pairs.push(['a', 'b']);
    expect(t.hook.getConnections()).toEqual([['p1', 'p2']]);

    const log = t.hook.getSoundLog();
    log.push('bump');
    expect(t.hook.getSoundLog()).toEqual(['place', 'place', 'snap']);

    const train = t.hook.getTrain()!;
    train.speed = 99;
    expect(t.hook.getTrain()!.speed).toBe(0);
  });

  it('getConnections is empty with no connection', () => {
    const t = setup();
    t.hook.placePiece('straight', 0, 0);
    t.hook.placePiece('house', 1, 0);
    expect(t.hook.getConnections()).toEqual([]);
  });
});

describe('debug helper', () => {
  it('forwards tileToScreen to the scene and returns null for non-numbers', () => {
    const calls: Array<[number, number]> = [];
    const t = setup((x, z) => {
      calls.push([x, z]);
      return x === 0 ? null : { x: x + 0.5, y: z + 0.5 };
    });
    const dbg = t.target.__DIORAMA_DEBUG__!;
    expect(dbg.tileToScreen(3, 4)).toEqual({ x: 3.5, y: 4.5 });
    expect(dbg.tileToScreen(0, 4)).toBeNull();
    expect(dbg.tileToScreen('3' as unknown as number, 4)).toBeNull();
    expect(calls).toEqual([
      [3, 4],
      [0, 4],
    ]);
  });
});

describe('code splitting (Requirement 38.3)', () => {
  it('no source file imports the hook module statically', () => {
    const root = join(process.cwd(), 'src');
    const files = (readdirSync(root, { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => join(root, f))
      .filter((f) => !f.endsWith(join('testHook', 'installTestHook.ts')));
    const staticImport = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"][^'"]*installTestHook['"]/;
    for (const f of files) expect(staticImport.test(readFileSync(f, 'utf8')), f).toBe(false);
  });
});

describe('equivalence with direct store calls (Requirements 16.7, 39.17)', () => {
  it('hook and store produce the same results, pieces, history and sound log', () => {
    const a = setup();
    const b = makeStore();
    const s = () => b.store.getState();

    const steps: Array<[unknown, unknown]> = [
      [a.hook.placePiece('station', 4, 4, 0), s().placePiece('station', 4, 4, { rotation: 0, autoAdjust: false })],
      [a.hook.placePiece('straight', 4, 3), s().placePiece('straight', 4, 3)],
      [a.hook.placePiece('curve', 5, 3), s().placePiece('curve', 5, 3, { rotation: undefined, autoAdjust: true })],
      [a.hook.placePiece('house', 4, 4), s().placePiece('house', 4, 4)],
      [a.hook.placePiece('station', 9, 9), s().placePiece('station', 9, 9)],
      [a.hook.movePiece('p2', 7, 7), s().movePiece('p2', 7, 7)],
      [a.hook.rotatePiece('p3'), s().rotatePiece('p3')],
      [a.hook.removePiece('p1'), s().removePiece('p1')],
      [a.hook.removePiece('p1'), s().removePiece('p1')],
      [a.hook.setMode('play'), s().setMode('play')],
    ];
    for (const [viaHook, direct] of steps) expect(viaHook).toEqual(direct);

    expect(a.store.getState().pieces).toEqual(s().pieces);
    expect(a.store.getState().history).toEqual(s().history);
    expect(a.store.getState().isDirty).toBe(s().isDirty);
    expect(a.hook.getSoundLog()).toEqual(b.audio.getLog());
  });
});
