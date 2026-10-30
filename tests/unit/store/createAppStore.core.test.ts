import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPort } from '@/audio/types';
import type { SoundEvent } from '@/domain/types';
import { createSaveRepository } from '@/persistence/saveRepository';
import { createSettingsRepository } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import { MAX_TOASTS, TOAST_MS, createAppStore } from '@/store/createAppStore';
import type { AppDeps } from '@/store/ports';
import { selectConnections, selectHasStation, selectStation } from '@/store/selectors';
import type { DragState } from '@/store/types';

/** Records every logged event, like the real manager's sound log. */
function recordingAudio(): AudioPort & { log: SoundEvent[] } {
  const log: SoundEvent[] = [];
  return {
    log,
    play: (e) => void log.push(e),
    startChug: () => void log.push('chug'),
    setChugLevel: () => {},
    stopChug: () => {},
    apply: () => {},
    getLog: () => [...log],
  };
}

function setup() {
  const storage = memoryStorage();
  const audio = recordingAudio();
  let clock = 1_000_000;
  let n = 0;
  const deps: AppDeps = {
    audio,
    train: { enterPlay: () => {}, exitPlay: () => {}, setDriveMode: () => {}, snapshot: () => null },
    scene: { captureThumbnail: () => null, resetView: () => {} },
    saves: createSaveRepository({ storage, warn: () => {} }),
    settings: createSettingsRepository({ storage, warn: () => {} }),
    now: () => clock,
    newId: () => `p${++n}`,
    warn: () => {},
  };
  const store = createAppStore(deps);
  return {
    store,
    audio,
    advanceClock: (ms: number) => {
      clock += ms;
    },
    get now() {
      return clock;
    },
  };
}

const dragOf = (pieceId: string): DragState => ({
  source: 'board',
  type: 'straight',
  pieceId,
  origin: { gridX: 0, gridZ: 0, rotation: 0 },
  rotation: 0,
  tile: null,
  valid: false,
});

describe('initial state', () => {
  it('starts on the menu with the Section 9 defaults and stored settings', () => {
    const { store } = setup();
    const s = store.getState();
    expect(s.screen).toBe('menu');
    expect(s).toMatchObject({
      pieces: [],
      selectedTool: null,
      selectedPieceId: null,
      mode: 'build',
      driveMode: 'auto',
      setting: 'bedroom',
      startFacing: 0,
      dioramaId: null,
      isDirty: false,
      audio: { muted: false, musicVolume: 0.5, sfxVolume: 0.8 },
      lowQuality: false,
      autosaveDueAt: null,
    });
  });
});

describe('build actions', () => {
  it('a successful placement returns the id, dirties the diorama, records history and plays place', () => {
    const t = setup();
    const result = t.store.getState().placePiece('straight', 3, 4);
    expect(result).toEqual({ ok: true, id: 'p1' });
    const s = t.store.getState();
    expect(s.pieces).toEqual([{ id: 'p1', type: 'straight', gridX: 3, gridZ: 4, rotation: 0 }]);
    expect(s.isDirty).toBe(true);
    expect(s.autosaveDueAt).toBe(t.now + 30_000);
    expect(s.history.past).toHaveLength(1);
    expect(t.audio.log).toEqual(['place']);
  });

  it('a rejected placement only plays invalid and changes nothing', () => {
    const t = setup();
    const before = t.store.getState();
    expect(t.store.getState().placePiece('hill', 15, 0)).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(t.store.getState().placePiece('dragon', 0, 0)).toEqual({ ok: false, reason: 'not_found' });
    const after = t.store.getState();
    expect(after.pieces).toBe(before.pieces);
    expect(after.history).toBe(before.history);
    expect(after.isDirty).toBe(false);
    expect(after.autosaveDueAt).toBeNull();
    expect(t.audio.log).toEqual(['invalid', 'invalid']);
  });

  it('rejects every build action in Play mode with play_mode', () => {
    const t = setup();
    const { id } = t.store.getState().placePiece('station', 5, 5) as { ok: true; id: string };
    t.store.setState({ mode: 'play' });
    t.audio.log.length = 0;
    const s = t.store.getState();
    expect(s.placePiece('straight', 0, 0)).toEqual({ ok: false, reason: 'play_mode' });
    expect(s.movePiece(id, 1, 1)).toEqual({ ok: false, reason: 'play_mode' });
    expect(s.rotatePiece(id)).toEqual({ ok: false, reason: 'play_mode' });
    expect(s.removePiece(id)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.audio.log).toEqual(['invalid', 'invalid', 'invalid', 'invalid']);
    expect(t.store.getState().pieces).toHaveLength(1);
  });

  it('plays snap after the action sound when a connection is created', () => {
    const t = setup();
    const s = t.store.getState();
    s.placePiece('straight', 5, 5, { rotation: 0 });
    s.placePiece('straight', 5, 6, { rotation: 0 });
    expect(t.audio.log).toEqual(['place', 'place', 'snap']);
    expect(selectConnections(t.store.getState())).toEqual([['p1', 'p2']]);
  });

  it('auto-adjusts a hook-style placement without a rotation and logs no rotate', () => {
    const t = setup();
    const s = t.store.getState();
    s.placePiece('straight', 5, 5, { rotation: 90 }); // connectors E and W
    s.placePiece('straight', 6, 5); // starts at 0°, turns to 90° to join
    expect(t.store.getState().pieces[1]?.rotation).toBe(90);
    expect(t.audio.log).toEqual(['place', 'place', 'snap']);
  });

  it('a move onto the same tile plays move but records nothing and keeps the diorama clean', () => {
    const t = setup();
    const { id } = t.store.getState().placePiece('house', 2, 2) as { ok: true; id: string };
    t.store.setState({ isDirty: false, autosaveDueAt: null });
    const before = t.store.getState();
    t.audio.log.length = 0;
    expect(before.movePiece(id, 2, 2)).toEqual({ ok: true });
    const after = t.store.getState();
    expect(after.pieces).toBe(before.pieces);
    expect(after.history.past).toHaveLength(1);
    expect(after.isDirty).toBe(false);
    expect(t.audio.log).toEqual(['move']);
  });

  it('rotate and move succeed with their sounds and keep the autosave due time while dirty', () => {
    const t = setup();
    const { id } = t.store.getState().placePiece('curve', 4, 4) as { ok: true; id: string };
    const due = t.store.getState().autosaveDueAt;
    t.advanceClock(5_000);
    expect(t.store.getState().rotatePiece(id)).toEqual({ ok: true });
    expect(t.store.getState().movePiece(id, 7, 7)).toEqual({ ok: true });
    const s = t.store.getState();
    expect(s.pieces[0]).toMatchObject({ gridX: 7, gridZ: 7, rotation: 90 });
    expect(s.autosaveDueAt).toBe(due);
    expect(t.audio.log).toEqual(['place', 'rotate', 'move']);
  });

  it('removing the selected piece clears the selection; deleteSelected needs a selection', () => {
    const t = setup();
    const s = t.store.getState();
    const a = (s.placePiece('house', 1, 1) as { ok: true; id: string }).id;
    const b = (s.placePiece('car', 2, 1) as { ok: true; id: string }).id;
    t.audio.log.length = 0;

    expect(t.store.getState().deleteSelected()).toBeNull();
    expect(t.audio.log).toEqual([]);

    t.store.getState().selectPiece(a);
    expect(t.store.getState().selectedPieceId).toBe(a);
    expect(t.store.getState().removePiece(a)).toEqual({ ok: true });
    expect(t.store.getState().selectedPieceId).toBeNull();

    t.store.getState().selectPiece(b);
    expect(t.store.getState().deleteSelected()).toEqual({ ok: true });
    expect(t.store.getState().pieces).toEqual([]);
    expect(t.store.getState().selectedPieceId).toBeNull();
    expect(t.audio.log).toEqual(['delete', 'delete']);
  });
});

describe('selection', () => {
  it('ignores unknown ids and Play mode, and never dirties the diorama', () => {
    const t = setup();
    const { id } = t.store.getState().placePiece('house', 1, 1) as { ok: true; id: string };
    t.store.setState({ isDirty: false });
    t.store.getState().selectPiece('nope');
    expect(t.store.getState().selectedPieceId).toBeNull();
    t.store.getState().selectPiece(id);
    expect(t.store.getState().selectedPieceId).toBe(id);
    expect(t.store.getState().isDirty).toBe(false);
    t.store.setState({ mode: 'play', selectedPieceId: null });
    t.store.getState().selectPiece(id);
    expect(t.store.getState().selectedPieceId).toBeNull();
  });

  it('selectTool refuses the station while one exists and does nothing in Play mode', () => {
    const t = setup();
    t.store.getState().selectTool('station');
    expect(t.store.getState().selectedTool).toBe('station');
    t.store.getState().placePiece('station', 8, 8);
    expect(selectHasStation(t.store.getState())).toBe(true);
    expect(selectStation(t.store.getState())?.gridX).toBe(8);

    t.store.getState().selectTool('curve');
    expect(t.store.getState().selectedTool).toBe('curve');
    t.store.getState().selectTool('station');
    expect(t.store.getState().selectedTool).toBe('curve');

    t.store.setState({ mode: 'play' });
    t.store.getState().selectTool('house');
    t.store.getState().selectTool(null);
    expect(t.store.getState().selectedTool).toBe('curve');

    t.store.setState({ mode: 'build' });
    t.store.getState().selectTool(null);
    expect(t.store.getState().selectedTool).toBeNull();
  });
});

describe('undo and redo', () => {
  it('undo restores the earlier pieces, dirties the diorama and plays no sound; redo re-applies', () => {
    const t = setup();
    const s = t.store.getState();
    const id = (s.placePiece('straight', 3, 3, { rotation: 0 }) as { ok: true; id: string }).id;
    s.rotatePiece(id);
    s.movePiece(id, 6, 6);
    const built = t.store.getState().pieces;
    t.store.setState({ isDirty: false, autosaveDueAt: null });
    t.store.getState().selectPiece(id);
    t.audio.log.length = 0;

    expect(t.store.getState().undo()).toBe(true);
    expect(t.store.getState().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3, rotation: 90 });
    expect(t.store.getState().isDirty).toBe(true);
    expect(t.store.getState().autosaveDueAt).toBe(t.now + 30_000);
    expect(t.store.getState().undo()).toBe(true);
    expect(t.store.getState().undo()).toBe(true);
    expect(t.store.getState().pieces).toEqual([]);
    expect(t.store.getState().selectedPieceId).toBeNull();
    expect(t.store.getState().undo()).toBe(false);

    expect(t.store.getState().redo()).toBe(true);
    expect(t.store.getState().redo()).toBe(true);
    expect(t.store.getState().redo()).toBe(true);
    expect(t.store.getState().pieces).toEqual(built);
    expect(t.store.getState().redo()).toBe(false);
    expect(t.audio.log).toEqual([]);
  });

  it('a new action after an undo clears the redo stack', () => {
    const t = setup();
    t.store.getState().placePiece('house', 1, 1);
    t.store.getState().undo();
    t.store.getState().placePiece('car', 2, 2);
    expect(t.store.getState().redo()).toBe(false);
    expect(t.store.getState().pieces.map((p) => p.type)).toEqual(['car']);
  });

  it('is ignored in Play mode and during a drag', () => {
    const t = setup();
    const { id } = t.store.getState().placePiece('station', 4, 4) as { ok: true; id: string };
    t.store.setState({ isDirty: false });
    const before = t.store.getState();

    t.store.setState({ mode: 'play' });
    expect(t.store.getState().undo()).toBe(false);
    t.store.setState({ mode: 'build', drag: dragOf(id) });
    expect(t.store.getState().undo()).toBe(false);
    expect(t.store.getState().redo()).toBe(false);

    const after = t.store.getState();
    expect(after.pieces).toBe(before.pieces);
    expect(after.history).toBe(before.history);
    expect(after.isDirty).toBe(false);
  });
});

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows at most 3 toasts, dropping the oldest', () => {
    const { store } = setup();
    const ids = ['a', 'b', 'c', 'd'].map((text) => store.getState().pushToast(text));
    expect(new Set(ids).size).toBe(4);
    expect(store.getState().toasts.map((t) => t.text)).toEqual(['b', 'c', 'd']);
    expect(store.getState().toasts).toHaveLength(MAX_TOASTS);
    store.getState().dispose();
  });

  it('dismisses each toast 3 seconds after it was shown, or earlier on request', () => {
    const { store } = setup();
    const first = store.getState().pushToast('Saved', 'success');
    vi.advanceTimersByTime(1_000);
    const second = store.getState().pushToast('Place a station to start', 'error');
    expect(store.getState().toasts).toEqual([
      { id: first, text: 'Saved', tone: 'success' },
      { id: second, text: 'Place a station to start', tone: 'error' },
    ]);
    vi.advanceTimersByTime(TOAST_MS - 1_000);
    expect(store.getState().toasts.map((t) => t.id)).toEqual([second]);
    store.getState().dismissToast(second);
    expect(store.getState().toasts).toEqual([]);
    // Only the autosave check interval remains.
    expect(vi.getTimerCount()).toBe(1);
    store.getState().dispose();
  });

  it('dispose clears pending toast timers and the autosave interval', () => {
    const { store } = setup();
    store.getState().pushToast('one');
    store.getState().pushToast('two');
    expect(vi.getTimerCount()).toBe(3);
    store.getState().dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
