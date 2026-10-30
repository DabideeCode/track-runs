import { afterEach, describe, expect, it } from 'vitest';
import type { AudioPort } from '@/audio/types';
import { NAME_VALIDATION_MESSAGE } from '@/domain/naming';
import type { Diorama, SoundEvent } from '@/domain/types';
import { SAVE_KEY, createSaveRepository } from '@/persistence/saveRepository';
import { createSettingsRepository } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import {
  TOAST_DELETE_FAILED,
  TOAST_RENAME_FAILED,
  TOAST_SAVED,
  TOAST_SAVE_FAILED,
  createAppStore,
  type AppStore,
} from '@/store/createAppStore';
import type { AppDeps, TimerHandle, Timers } from '@/store/ports';

// Inline fakes; the shared harness comes with task 10.5.

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

/** Manual timers driven by a shared clock: `advance(ms)` moves time and fires due callbacks in order. */
function manualTimers(clock: { now: number }) {
  type Job = { id: number; at: number; every: number | null; fn: () => void };
  const jobs = new Map<number, Job>();
  let next = 0;
  const timers: Timers = {
    setTimeout: (fn, ms) => {
      const id = ++next;
      jobs.set(id, { id, at: clock.now + ms, every: null, fn });
      return id;
    },
    clearTimeout: (h: TimerHandle) => void jobs.delete(h as number),
    setInterval: (fn, ms) => {
      const id = ++next;
      jobs.set(id, { id, at: clock.now + ms, every: ms, fn });
      return id;
    },
    clearInterval: (h: TimerHandle) => void jobs.delete(h as number),
  };
  function advance(ms: number): void {
    const end = clock.now + ms;
    for (;;) {
      let due: Job | null = null;
      for (const j of jobs.values()) if (j.at <= end && (due === null || j.at < due.at)) due = j;
      if (due === null) break;
      clock.now = due.at;
      if (due.every === null) jobs.delete(due.id);
      else due.at += due.every;
      due.fn();
    }
    clock.now = end;
  }
  return { timers, advance, count: () => jobs.size };
}

const stores: AppStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.getState().dispose();
});

function setup(opts: { init?: Record<string, string>; thumbnail?: () => string | null } = {}) {
  const storage = memoryStorage(opts.init);
  const audio = recordingAudio();
  const clock = { now: Date.parse('2026-10-29T10:00:00.000Z') };
  const t = manualTimers(clock);
  const trainCalls: string[] = [];
  let pieceN = 0;
  let dioramaN = 0;
  const deps: AppDeps = {
    audio,
    train: {
      enterPlay: () => void trainCalls.push('enterPlay'),
      exitPlay: () => void trainCalls.push('exitPlay'),
      setDriveMode: () => {},
      snapshot: () => null,
    },
    scene: { captureThumbnail: opts.thumbnail ?? (() => 'data:image/jpeg;base64,AAAA'), resetView: () => {} },
    saves: createSaveRepository({
      storage,
      now: () => new Date(clock.now),
      newId: () => `d${++dioramaN}`,
      warn: () => {},
    }),
    settings: createSettingsRepository({ storage, warn: () => {} }),
    now: () => clock.now,
    newId: () => `p${++pieceN}`,
    timers: t.timers,
    warn: () => {},
  };
  const store = createAppStore(deps);
  stores.push(store);
  const stored = (): Diorama[] => {
    const raw = storage.getItem(SAVE_KEY);
    return raw === null ? [] : (JSON.parse(raw) as { dioramas: Diorama[] }).dioramas;
  };
  return { store, storage, audio, clock, advance: t.advance, timerCount: t.count, stored, trainCalls };
}

const diorama = (over: Partial<Diorama> = {}): Diorama => ({
  id: 'saved1',
  name: 'Loop',
  setting: 'kitchen',
  startFacing: 180,
  pieces: [
    { id: 'b', type: 'straight', gridX: 2, gridZ: 2, rotation: 90 },
    { id: 'a', type: 'station', gridX: 3, gridZ: 2, rotation: 90 },
    { id: 'c', type: 'house', gridX: 9, gridZ: 9, rotation: 0 },
  ],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
  ...over,
});

const saveFile = (...ds: Diorama[]) => ({ [SAVE_KEY]: JSON.stringify({ version: 1, dioramas: ds }) });
const texts = (store: AppStore) => store.getState().toasts.map((t) => t.text);

describe('newDiorama', () => {
  it('opens an empty unsaved bedroom diorama in Build mode and writes nothing', () => {
    const t = setup();
    t.store.getState().newDiorama();
    const s = t.store.getState();
    expect(s).toMatchObject({
      screen: 'playfield',
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
      autosaveDueAt: null,
    });
    expect(s.history).toEqual({ past: [], future: [] });
    expect(t.storage.getItem(SAVE_KEY)).toBeNull();
  });

  it('picks the smallest free "Untitled diorama N" among saved names', () => {
    const t = setup({
      init: saveFile(
        diorama({ id: 'x1', name: 'Untitled diorama' }),
        diorama({ id: 'x2', name: 'Untitled diorama 3' }),
      ),
    });
    t.store.getState().newDiorama();
    expect(t.store.getState().dioramaName).toBe('Untitled diorama 2');
  });

  it('resets the setting, start facing and history of a previously opened diorama', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.store.getState().openDiorama('saved1');
    t.store.getState().placePiece('car', 0, 0);
    t.store.getState().backToMenu();
    t.store.getState().discardAndLeave();
    t.store.getState().newDiorama();
    const s = t.store.getState();
    expect(s).toMatchObject({ setting: 'bedroom', startFacing: 0, pieces: [], isDirty: false });
    expect(s.history.past).toEqual([]);
  });
});

describe('openDiorama', () => {
  it('restores the saved pieces in saved order and clears history, selection and dirty state', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 1, 1);
    t.store.getState().selectTool('car');
    expect(t.store.getState().openDiorama('saved1')).toBe(true);
    const s = t.store.getState();
    expect(s.screen).toBe('playfield');
    expect(s.pieces).toEqual(diorama().pieces);
    expect(s).toMatchObject({
      dioramaId: 'saved1',
      dioramaName: 'Loop',
      setting: 'kitchen',
      startFacing: 180,
      mode: 'build',
      isDirty: false,
      selectedTool: null,
      selectedPieceId: null,
      autosaveDueAt: null,
      createdAt: '2026-10-01T08:00:00.000Z',
    });
    expect(s.history).toEqual({ past: [], future: [] });
  });

  it('returns false with an error toast for an unknown id', () => {
    const t = setup();
    expect(t.store.getState().openDiorama('nope')).toBe(false);
    expect(t.store.getState().screen).toBe('menu');
    expect(t.store.getState().toasts).toHaveLength(1);
  });
});

describe('rename', () => {
  it('stores the trimmed name and refreshes the list', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.store.getState().refreshList();
    t.store.getState().startRename('saved1');
    expect(t.store.getState().renamingId).toBe('saved1');
    expect(t.store.getState().renameDiorama('saved1', '  Big loop  ')).toBe(true);
    expect(t.store.getState().renamingId).toBeNull();
    expect(t.store.getState().savedList.map((d) => d.name)).toEqual(['Big loop']);
    expect(t.stored()[0]?.name).toBe('Big loop');
  });

  it('rejects an empty or over-long name with the validation message and writes nothing', () => {
    const t = setup({ init: saveFile(diorama()) });
    const before = t.storage.getItem(SAVE_KEY);
    t.store.getState().startRename('saved1');
    expect(t.store.getState().renameDiorama('saved1', '   ')).toBe(false);
    expect(t.store.getState().renameError).toBe(NAME_VALIDATION_MESSAGE);
    expect(t.store.getState().renameDiorama('saved1', 'x'.repeat(41))).toBe(false);
    expect(t.storage.getItem(SAVE_KEY)).toBe(before);
    t.store.getState().cancelRename();
    expect(t.store.getState()).toMatchObject({ renamingId: null, renameError: null });
  });

  it('keeps the old name and shows a toast when the write fails', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.store.getState().refreshList();
    t.storage.setFailWrites(true);
    expect(t.store.getState().renameDiorama('saved1', 'New name')).toBe(false);
    expect(texts(t.store)).toEqual([TOAST_RENAME_FAILED]);
    expect(t.store.getState().savedList.map((d) => d.name)).toEqual(['Loop']);
    expect(t.stored()[0]?.name).toBe('Loop');
  });
});

describe('delete dialog', () => {
  it('Cancel keeps the diorama; Delete removes it and leaves the empty list', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.store.getState().refreshList();
    t.store.getState().requestDeleteDiorama('saved1');
    expect(t.store.getState().dialog).toEqual({ kind: 'deleteDiorama', id: 'saved1' });
    t.store.getState().cancelDialog();
    expect(t.store.getState().dialog).toBeNull();
    expect(t.stored()).toHaveLength(1);

    t.store.getState().requestDeleteDiorama('saved1');
    t.store.getState().confirmDialog();
    expect(t.store.getState().dialog).toBeNull();
    expect(t.stored()).toEqual([]);
    expect(t.store.getState().savedList).toEqual([]);
  });

  it('shows a toast and keeps the entry when the delete write fails', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.storage.setFailWrites(true);
    t.store.getState().requestDeleteDiorama('saved1');
    t.store.getState().confirmDialog();
    expect(texts(t.store)).toEqual([TOAST_DELETE_FAILED]);
    expect(t.store.getState().savedList.map((d) => d.id)).toEqual(['saved1']);
  });
});

describe('save', () => {
  it('a first save stores a new entry, sets dioramaId, clears dirty state and shows "Saved"', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('station', 4, 4);
    expect(t.store.getState().isDirty).toBe(true);
    expect(t.store.getState().save()).toBe(true);
    const s = t.store.getState();
    expect(s).toMatchObject({ dioramaId: 'd1', isDirty: false, autosaveDueAt: null });
    expect(texts(t.store)).toEqual([TOAST_SAVED]);
    const [entry] = t.stored();
    expect(entry).toMatchObject({ id: 'd1', name: 'Untitled diorama', setting: 'bedroom', startFacing: 0 });
    expect(entry?.pieces).toEqual(s.pieces);
    expect(entry?.thumbnail).toBe('data:image/jpeg;base64,AAAA');
    expect(entry?.createdAt).toBe(entry?.updatedAt);

    // A second save replaces the same entry.
    t.advance(5_000);
    t.store.getState().placePiece('house', 0, 0);
    expect(t.store.getState().save()).toBe(true);
    expect(t.stored()).toHaveLength(1);
    expect(t.stored()[0]?.pieces).toHaveLength(2);
  });

  it('a failed save keeps isDirty, leaves storage unchanged and shows the failure toast', () => {
    const t = setup({ init: saveFile(diorama()) });
    t.store.getState().openDiorama('saved1');
    t.store.getState().placePiece('car', 0, 0);
    const before = t.storage.getItem(SAVE_KEY);
    t.storage.setFailWrites(true);
    expect(t.store.getState().save()).toBe(false);
    expect(t.store.getState().isDirty).toBe(true);
    expect(t.store.getState().pieces).toHaveLength(4);
    expect(t.storage.getItem(SAVE_KEY)).toBe(before);
    expect(texts(t.store)).toEqual([TOAST_SAVE_FAILED]);
  });

  it.each([
    ['throws', () => { throw new Error('no WebGL'); }],
    ['returns null', () => null],
  ])('saves without a thumbnail when capture %s', (_label, capture) => {
    const t = setup({ init: saveFile(diorama({ thumbnail: 'data:image/jpeg;base64,OLD' })), thumbnail: capture });
    t.store.getState().openDiorama('saved1');
    t.store.getState().placePiece('car', 0, 0);
    expect(t.store.getState().save()).toBe(true);
    const [entry] = t.stored();
    expect(entry).not.toHaveProperty('thumbnail');
    expect(entry?.pieces).toHaveLength(4);
    expect(t.store.getState().thumbnail).toBeNull();
  });

  it('does nothing on the menu', () => {
    const t = setup();
    expect(t.store.getState().save()).toBe(false);
    expect(t.storage.getItem(SAVE_KEY)).toBeNull();
  });
});

describe('back to menu and the unsaved-changes dialog', () => {
  it('leaves at once when clean', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().backToMenu();
    expect(t.store.getState().screen).toBe('menu');
    expect(t.store.getState().dialog).toBeNull();
  });

  it('opens the dialog when dirty; Cancel keeps everything', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 2, 2);
    t.store.getState().backToMenu();
    expect(t.store.getState().dialog).toEqual({ kind: 'unsaved' });
    expect(t.store.getState().screen).toBe('playfield');
    t.store.getState().cancelDialog();
    expect(t.store.getState()).toMatchObject({ screen: 'playfield', dialog: null, isDirty: true });
    expect(t.store.getState().pieces).toHaveLength(1);
  });

  it('Discard leaves without writing', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 2, 2);
    t.store.getState().backToMenu();
    t.store.getState().discardAndLeave();
    expect(t.store.getState().screen).toBe('menu');
    expect(t.storage.getItem(SAVE_KEY)).toBeNull();
    expect(t.store.getState().savedList).toEqual([]);
  });

  it('Save leaves to the menu with the diorama listed', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 2, 2);
    t.store.getState().backToMenu();
    t.store.getState().confirmDialog();
    const s = t.store.getState();
    expect(s.screen).toBe('menu');
    expect(s.dialog).toBeNull();
    expect(s.savedList.map((d) => d.name)).toEqual(['Untitled diorama']);
  });

  it('a failed Save stays on the playfield with changes intact', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 2, 2);
    t.store.getState().backToMenu();
    t.storage.setFailWrites(true);
    t.store.getState().confirmDialog();
    const s = t.store.getState();
    expect(s).toMatchObject({ screen: 'playfield', dialog: null, isDirty: true });
    expect(s.pieces).toHaveLength(1);
    expect(texts(t.store)).toEqual([TOAST_SAVE_FAILED]);
  });

  it('stops a running train when leaving from Play mode', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.setState({ mode: 'play' });
    t.store.getState().backToMenu();
    expect(t.trainCalls).toEqual(['exitPlay']);
    expect(t.store.getState()).toMatchObject({ screen: 'menu', mode: 'build' });
  });
});

describe('autosave', () => {
  it('fires 30 to 31 s after the diorama becomes dirty, in Build mode', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 2, 2);
    t.advance(29_000);
    expect(t.storage.getItem(SAVE_KEY)).toBeNull();
    t.advance(2_000);
    expect(t.stored()).toHaveLength(1);
    expect(t.store.getState()).toMatchObject({ isDirty: false, dioramaId: 'd1', autosaveDueAt: null });
    expect(texts(t.store)).toEqual([TOAST_SAVED]);

    // Later autosaves update the same entry.
    t.store.getState().placePiece('car', 3, 3);
    t.advance(31_000);
    expect(t.stored()).toHaveLength(1);
    expect(t.stored()[0]?.pieces).toHaveLength(2);
  });

  it('retries 30 s after a failed attempt', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('house', 2, 2);
    t.storage.setFailWrites(true);
    t.advance(30_000); // the attempt runs on the check at exactly 30 s
    expect(t.store.getState().isDirty).toBe(true);
    expect(texts(t.store)).toEqual([TOAST_SAVE_FAILED]);
    expect(t.store.getState().autosaveDueAt).toBe(t.clock.now + 30_000);

    t.storage.setFailWrites(false);
    t.advance(29_000);
    expect(t.storage.getItem(SAVE_KEY)).toBeNull();
    t.advance(1_000);
    expect(t.stored()).toHaveLength(1);
    expect(t.store.getState().isDirty).toBe(false);
  });

  it('does not write in Play mode', () => {
    const t = setup();
    t.store.getState().newDiorama();
    t.store.getState().placePiece('station', 2, 2);
    t.store.setState({ mode: 'play' });
    t.advance(120_000);
    expect(t.storage.getItem(SAVE_KEY)).toBeNull();
    expect(t.store.getState().isDirty).toBe(true);
  });

  it('dispose stops the interval', () => {
    const t = setup();
    expect(t.timerCount()).toBe(1);
    t.store.getState().dispose();
    expect(t.timerCount()).toBe(0);
  });
});
