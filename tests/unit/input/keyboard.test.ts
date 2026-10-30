import { afterEach, describe, expect, it } from 'vitest';
import type { AudioPort } from '@/audio/types';
import type { SoundEvent } from '@/domain/types';
import {
  createKeyboardHandler,
  handleKeyDown,
  handleKeyUp,
  isTextInputTarget,
  type KeyEventLike,
  type KeyboardTarget,
} from '@/input/useKeyboardShortcuts';
import { createSaveRepository } from '@/persistence/saveRepository';
import { createSettingsRepository } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import { TrainRuntime } from '@/runtime/TrainRuntime';
import { createAppStore, type AppStore } from '@/store/createAppStore';
import type { AppDeps, Timers } from '@/store/ports';

// Inline fakes; the shared store harness comes with task 10.5.

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

function setup() {
  const storage = memoryStorage();
  const audio = recordingAudio();
  let pieceN = 0;
  const deps: AppDeps = {
    audio,
    train: { enterPlay: () => {}, exitPlay: () => {}, setDriveMode: () => {}, snapshot: () => null },
    scene: { captureThumbnail: () => null, resetView: () => {} },
    saves: createSaveRepository({ storage, now: () => new Date('2026-10-29T10:00:00.000Z'), newId: () => 'd1', warn: () => {} }),
    settings: createSettingsRepository({ storage, warn: () => {} }),
    now: () => Date.parse('2026-10-29T10:00:00.000Z'),
    newId: () => `p${++pieceN}`,
    timers: idleTimers,
    warn: () => {},
  };
  const store = createAppStore(deps);
  stores.push(store);
  store.getState().newDiorama();

  const keyCalls: Array<Partial<{ w: boolean; s: boolean }> | 'clear'> = [];
  const train = {
    setKeys: (k: Partial<{ w: boolean; s: boolean }>) => void keyCalls.push(k),
    clearKeys: () => void keyCalls.push('clear'),
  };
  const ctx = { store, train };
  const down = (key: string, extra: Partial<KeyEventLike> = {}) => {
    let prevented = false;
    const cmd = handleKeyDown({ key, preventDefault: () => void (prevented = true), ...extra }, ctx);
    return { cmd, prevented };
  };
  return { store, audio, keyCalls, train, ctx, down, get: () => store.getState() };
}

const textInput = { tagName: 'INPUT' };

describe('Build mode keys', () => {
  it('R rotates the selected piece once and plays rotate', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().selectPiece(id);
    t.audio.log.length = 0;
    expect(t.down('r').cmd).toBe('rotatePiece');
    expect(t.get().pieces[0]!.rotation).toBe(90);
    expect(t.down('R', { shiftKey: true }).cmd).toBe('rotatePiece');
    expect(t.get().pieces[0]!.rotation).toBe(180);
    expect(t.audio.log).toEqual(['rotate', 'rotate']);
  });

  it('R with nothing selected and no drag changes nothing and plays nothing', () => {
    const t = setup();
    t.get().placePiece('house', 3, 3);
    t.audio.log.length = 0;
    const before = t.get().pieces;
    expect(t.down('r').cmd).toBeNull();
    expect(t.get().pieces).toBe(before);
    expect(t.audio.log).toEqual([]);
  });

  it('R during a drag rotates the ghost, not the selected piece', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().selectPiece(id);
    t.get().beginDrag({ source: 'palette', type: 'straight', tile: { gridX: 5, gridZ: 5 } });
    expect(t.down('r').cmd).toBe('rotateDrag');
    expect(t.get().drag!.rotation).toBe(90);
    expect(t.get().pieces[0]!.rotation).toBe(0);
  });

  it('auto-repeat and Ctrl/Meta/Alt modifiers do not trigger R', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().selectPiece(id);
    expect(t.down('r', { repeat: true }).cmd).toBeNull();
    expect(t.down('r', { ctrlKey: true }).cmd).toBeNull();
    expect(t.down('r', { metaKey: true }).cmd).toBeNull();
    expect(t.down('r', { altKey: true }).cmd).toBeNull();
    expect(t.get().pieces[0]!.rotation).toBe(0);
  });

  it('Delete and Backspace remove the selected piece, clear the selection and prevent default', () => {
    const t = setup();
    const a = t.get().placePiece('house', 1, 1) as { ok: true; id: string };
    const b = t.get().placePiece('car', 2, 2) as { ok: true; id: string };
    t.audio.log.length = 0;

    t.get().selectPiece(a.id);
    const r1 = t.down('Delete');
    expect(r1).toEqual({ cmd: 'deleteSelected', prevented: true });
    t.get().selectPiece(b.id);
    expect(t.down('Backspace').cmd).toBe('deleteSelected');

    expect(t.get().pieces).toEqual([]);
    expect(t.get().selectedPieceId).toBeNull();
    expect(t.audio.log).toEqual(['delete', 'delete']);
  });

  it('Delete with nothing selected changes nothing and plays nothing', () => {
    const t = setup();
    t.get().placePiece('house', 1, 1);
    t.audio.log.length = 0;
    expect(t.down('Delete').cmd).toBeNull();
    expect(t.down('Backspace').cmd).toBeNull();
    expect(t.get().pieces).toHaveLength(1);
    expect(t.audio.log).toEqual([]);
  });

  it('F flips the start facing once per press and ignores auto-repeat', () => {
    const t = setup();
    expect(t.down('f').cmd).toBe('flipStartFacing');
    expect(t.get().startFacing).toBe(180);
    expect(t.get().isDirty).toBe(true);
    expect(t.down('f', { repeat: true }).cmd).toBeNull();
    expect(t.get().startFacing).toBe(180);
    expect(t.down('F').cmd).toBe('flipStartFacing');
    expect(t.get().startFacing).toBe(0);
    expect(t.down('f', { ctrlKey: true }).cmd).toBeNull();
    expect(t.get().startFacing).toBe(0);
  });

  it('Ctrl+Z and Cmd+Z undo; Ctrl+Shift+Z and Cmd+Shift+Z redo', () => {
    const t = setup();
    t.get().placePiece('house', 1, 1);
    t.get().placePiece('car', 2, 2);
    const two = t.get().pieces;

    expect(t.down('z', { ctrlKey: true })).toEqual({ cmd: 'undo', prevented: true });
    expect(t.get().pieces).toHaveLength(1);
    expect(t.down('z', { metaKey: true }).cmd).toBe('undo');
    expect(t.get().pieces).toHaveLength(0);
    expect(t.down('Z', { ctrlKey: true, shiftKey: true }).cmd).toBe('redo');
    expect(t.get().pieces).toHaveLength(1);
    expect(t.down('z', { metaKey: true, shiftKey: true }).cmd).toBe('redo');
    expect(t.get().pieces).toEqual(two);
  });

  it('plain Z, Alt+Ctrl+Z and Ctrl+Y do nothing', () => {
    const t = setup();
    t.get().placePiece('house', 1, 1);
    expect(t.down('z').cmd).toBeNull();
    expect(t.down('z', { ctrlKey: true, altKey: true }).cmd).toBeNull();
    expect(t.down('y', { ctrlKey: true }).cmd).toBeNull();
    expect(t.get().pieces).toHaveLength(1);
  });
});

describe('Escape precedence', () => {
  it('cancels a board drag first and the piece keeps its place', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 3 } });
    t.get().setDragTile({ gridX: 8, gridZ: 8 });
    t.get().rotateDrag();
    const before = t.get().pieces;
    t.audio.log.length = 0;

    expect(t.down('Escape').cmd).toBe('cancelDrag');
    expect(t.get().drag).toBeNull();
    expect(t.get().pieces).toBe(before);
    expect(t.get().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3, rotation: 0 });
    expect(t.audio.log).toEqual([]);
  });

  it('cancels a palette drag before clearing the tool, then clears the tool, then the selection', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().selectPiece(id);
    t.get().beginDrag({ source: 'palette', type: 'car', tile: { gridX: 5, gridZ: 5 } });
    expect(t.get().selectedTool).toBe('car');

    expect(t.down('Escape').cmd).toBe('cancelDrag');
    expect(t.get().selectedTool).toBe('car');
    expect(t.get().pieces).toHaveLength(1);

    expect(t.down('Escape').cmd).toBe('clearTool');
    expect(t.get().selectedTool).toBeNull();
    expect(t.get().selectedPieceId).toBe(id);

    expect(t.down('Escape').cmd).toBe('clearSelection');
    expect(t.get().selectedPieceId).toBeNull();

    expect(t.down('Escape').cmd).toBeNull();
    expect(t.get().isDirty).toBe(true); // from the placement only
  });
});

describe('suppression', () => {
  it('recognises text-entry targets', () => {
    expect(isTextInputTarget({ tagName: 'input' })).toBe(true);
    expect(isTextInputTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextInputTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTextInputTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextInputTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextInputTarget(null)).toBe(false);
    expect(isTextInputTarget(undefined)).toBe(false);
  });

  it('ignores every shortcut while a text input has focus', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().selectPiece(id);
    t.get().selectTool('car');
    const before = t.get();
    for (const [key, extra] of [
      ['r', {}],
      ['Delete', {}],
      ['Backspace', {}],
      ['Escape', {}],
      ['f', {}],
      ['z', { ctrlKey: true }],
      ['z', { ctrlKey: true, shiftKey: true }],
    ] as const) {
      expect(t.down(key, { ...extra, target: textInput })).toEqual({ cmd: null, prevented: false });
    }
    const after = t.get();
    expect(after.pieces).toBe(before.pieces);
    expect(after.history).toBe(before.history);
    expect(after.selectedPieceId).toBe(id);
    expect(after.selectedTool).toBe('car');
    expect(after.startFacing).toBe(0);
  });

  it('ignores every shortcut while a dialog is open', () => {
    const t = setup();
    const { id } = t.get().placePiece('house', 3, 3) as { ok: true; id: string };
    t.get().selectPiece(id);
    t.get().backToMenu(); // dirty, so the unsaved-changes dialog opens
    expect(t.get().dialog).toEqual({ kind: 'unsaved' });
    for (const key of ['r', 'Delete', 'Escape', 'f']) expect(t.down(key).cmd).toBeNull();
    expect(t.down('z', { ctrlKey: true }).cmd).toBeNull();
    expect(t.get().pieces).toHaveLength(1);
    expect(t.get().selectedPieceId).toBe(id);
    expect(t.get().startFacing).toBe(0);
  });

  it('ignores every shortcut on the main menu', () => {
    const t = setup();
    t.get().backToMenu(); // clean, so it leaves straight away
    expect(t.get().screen).toBe('menu');
    expect(t.down('f').cmd).toBeNull();
    expect(t.down('z', { ctrlKey: true }).cmd).toBeNull();
  });

  it('ignores W and S in Build mode', () => {
    const t = setup();
    expect(t.down('w').cmd).toBeNull();
    expect(t.down('s').cmd).toBeNull();
    expect(t.keyCalls).toEqual([]);
  });
});

describe('Play mode', () => {
  function inPlay() {
    const t = setup();
    const { id } = t.get().placePiece('station', 4, 4) as { ok: true; id: string };
    expect(t.get().setMode('play')).toEqual({ ok: true });
    t.audio.log.length = 0;
    return { ...t, stationId: id };
  }

  it('ignores R, Delete, Backspace, Escape, F, undo and redo', () => {
    const t = inPlay();
    t.store.setState({ selectedPieceId: t.stationId }); // force a selection to prove the keys are ignored
    const before = t.get();
    for (const key of ['r', 'Delete', 'Backspace', 'Escape', 'f']) expect(t.down(key).cmd).toBeNull();
    expect(t.down('z', { ctrlKey: true }).cmd).toBeNull();
    expect(t.down('z', { ctrlKey: true, shiftKey: true }).cmd).toBeNull();
    const after = t.get();
    expect(after.pieces).toBe(before.pieces);
    expect(after.startFacing).toBe(0);
    expect(after.mode).toBe('play');
    expect(t.audio.log).toEqual([]);
  });

  it('ignores W and S keydowns in Auto driving', () => {
    const t = inPlay();
    expect(t.get().driveMode).toBe('auto');
    expect(t.down('w').cmd).toBeNull();
    expect(t.down('s').cmd).toBeNull();
    expect(t.keyCalls).toEqual([]);
  });

  it('passes W and S to the train in Manual driving and releases them on keyup', () => {
    const t = inPlay();
    t.get().toggleDriveMode();
    expect(t.get().driveMode).toBe('manual');

    expect(t.down('w').cmd).toBe('driveForward');
    expect(t.down('W', { shiftKey: true, repeat: true }).cmd).toBe('driveForward');
    handleKeyUp({ key: 'w' }, t.ctx);
    expect(t.down('s').cmd).toBe('driveReverse');
    handleKeyUp({ key: 's', target: textInput }, t.ctx); // keyup always releases
    expect(t.keyCalls).toEqual([{ w: true }, { w: true }, { w: false }, { s: true }, { s: false }]);
  });

  it('ignores W and S with Ctrl, Meta or Alt, in a text input, or while a dialog is open', () => {
    const t = inPlay();
    t.get().toggleDriveMode();
    expect(t.down('w', { ctrlKey: true }).cmd).toBeNull();
    expect(t.down('w', { metaKey: true }).cmd).toBeNull();
    expect(t.down('s', { altKey: true }).cmd).toBeNull();
    expect(t.down('w', { target: textInput }).cmd).toBeNull();
    t.store.setState({ dialog: { kind: 'unsaved' } });
    expect(t.down('w').cmd).toBeNull();
    expect(t.keyCalls).toEqual([]);
  });

  it('drives the real train runtime: held W moves the train forward', () => {
    const t = inPlay();
    const runtime = new TrainRuntime(recordingAudio(), { source: () => t.get() });
    runtime.enterPlay(t.get().pieces, t.get().startFacing);
    t.get().toggleDriveMode();
    runtime.setDriveMode('manual');
    const ctx = { store: t.store, train: runtime };

    handleKeyDown({ key: 'w' }, ctx);
    expect(runtime.getKeys()).toEqual({ w: true, s: false });
    for (let i = 0; i < 10; i++) runtime.tick(1 / 60);
    expect(runtime.snapshot()).toMatchObject({ moving: true, direction: 'forward' });

    handleKeyUp({ key: 'w' }, ctx);
    expect(runtime.getKeys()).toEqual({ w: false, s: false });
  });
});

describe('createKeyboardHandler', () => {
  type Listener = (e?: unknown) => void;
  function fakeTarget() {
    const listeners = new Map<string, Set<Listener>>();
    const target = {
      addEventListener(type: string, l: Listener) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(l);
      },
      removeEventListener(type: string, l: Listener) {
        listeners.get(type)?.delete(l);
      },
      dispatch(type: string, e?: unknown) {
        for (const l of [...(listeners.get(type) ?? [])]) l(e);
      },
      count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    };
    return target;
  }

  it('wires keydown, keyup and blur, and detaches cleanly', () => {
    const t = setup();
    t.get().placePiece('station', 4, 4);
    t.get().setMode('play');
    t.get().toggleDriveMode();
    const target = fakeTarget();
    const detach = createKeyboardHandler({ store: t.store, train: t.train, target: target as unknown as KeyboardTarget });
    expect(target.count()).toBe(3);

    target.dispatch('keydown', { key: 's' });
    target.dispatch('keyup', { key: 's' });
    target.dispatch('keydown', { key: 'w' });
    target.dispatch('blur');
    expect(t.keyCalls).toEqual([{ s: true }, { s: false }, { w: true }, 'clear']);

    detach();
    expect(target.count()).toBe(0);
    expect(t.keyCalls.at(-1)).toBe('clear');
    target.dispatch('keydown', { key: 'w' });
    expect(t.keyCalls).toHaveLength(5);
  });
});
