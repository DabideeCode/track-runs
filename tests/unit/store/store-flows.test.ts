/**
 * Store flow tests (task 10.15).
 *
 * Each test walks one user journey end to end through the real store, the
 * real save repository on memory storage, the real train runtime and the
 * keyboard handler, using the harness in `./harness.ts`. The single-action
 * checks already live in `createAppStore.*.test.ts`; these tests check how
 * the actions combine.
 *
 * Requirements 4.1, 4.5, 4.6, 5.9, 6.4, 10.7, 11.8, 11.9, 18.2, 22.6 to 22.11, 23.4.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Diorama } from '@/domain/types';
import { handleKeyDown, type KeyCommand } from '@/input/useKeyboardShortcuts';
import { SAVE_KEY } from '@/persistence/saveRepository';
import {
  TOAST_DELETE_FAILED,
  TOAST_NO_STATION,
  TOAST_RENAME_FAILED,
  TOAST_SAVED,
  TOAST_SAVE_FAILED,
} from '@/store/createAppStore';
import { FAKE_THUMBNAIL, createHarness, disposeHarnesses, type Harness } from './harness';

afterEach(disposeHarnesses);

const kitchenLoop: Diorama = {
  id: 'loop',
  name: 'Kitchen loop',
  setting: 'kitchen',
  startFacing: 180,
  pieces: [
    { id: 'a', type: 'station', gridX: 4, gridZ: 4, rotation: 0 },
    { id: 'b', type: 'straight', gridX: 4, gridZ: 5, rotation: 0 },
    { id: 'c', type: 'house', gridX: 9, gridZ: 9, rotation: 90 },
  ],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

const untitled = (id: string, name: string, updatedAt: string): Diorama => ({
  id,
  name,
  setting: 'bedroom',
  startFacing: 0,
  pieces: [],
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt,
});

/** Presses a key through the real keyboard handler. */
function press(h: Harness, key: string): KeyCommand | null {
  return handleKeyDown({ key }, { store: h.store, train: h.train });
}

const toastTexts = (h: Harness) => h.store.getState().toasts.map((t) => t.text);

describe('new diorama', () => {
  it('starts empty, in Build mode on the bedroom floor, after another diorama was open (4.1, 4.5)', () => {
    const h = createHarness({
      saved: [
        kitchenLoop,
        untitled('u1', 'Untitled diorama', '2026-10-03T08:00:00.000Z'),
        untitled('u2', 'Untitled diorama 2', '2026-10-04T08:00:00.000Z'),
      ],
      start: { open: 'loop' },
    });
    const s = h.store.getState();
    // Change everything a new diorama must reset.
    s.selectTool('house');
    s.selectPiece('b');
    s.flipStartFacing();
    s.placePiece('pineTree', 1, 1);
    s.undo();
    s.setMode('play');
    expect(h.store.getState().mode).toBe('play');
    s.setMode('build');
    s.backToMenu();
    expect(h.store.getState().dialog).toEqual({ kind: 'unsaved' });
    h.store.getState().discardAndLeave();
    const before = h.storage.getItem(SAVE_KEY);

    h.store.getState().newDiorama();

    const n = h.store.getState();
    expect(n.screen).toBe('playfield');
    expect(n.mode).toBe('build');
    expect(n.pieces).toEqual([]);
    expect(n.setting).toBe('bedroom');
    expect(n.dioramaName).toBe('Untitled diorama 3');
    expect(n.dioramaId).toBeNull();
    expect(n.startFacing).toBe(0);
    expect(n.selectedTool).toBeNull();
    expect(n.selectedPieceId).toBeNull();
    expect(n.isDirty).toBe(false);
    expect(n.history).toEqual({ past: [], future: [] });
    expect(n.undo()).toBe(false);
    expect(n.redo()).toBe(false);
    // Creating a diorama writes nothing (Requirement 4.7).
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(h.getTrain()).toBeNull();
  });

  it('names the next diorama after the one just saved, ignoring unsaved names', () => {
    const h = createHarness({ start: 'playfield' });
    expect(h.store.getState().dioramaName).toBe('Untitled diorama');
    h.store.getState().placePiece('house', 2, 2);
    expect(h.store.getState().save()).toBe(true);
    h.store.getState().backToMenu();
    expect(h.store.getState().screen).toBe('menu');

    h.store.getState().newDiorama();
    expect(h.store.getState().dioramaName).toBe('Untitled diorama 2');
    // Leaving the unsaved second diorama does not reserve its name.
    h.store.getState().backToMenu();
    h.store.getState().newDiorama();
    expect(h.store.getState().dioramaName).toBe('Untitled diorama 2');
  });
});

describe('opening a saved diorama', () => {
  it('resets history, selection and the tool, and loads the saved state (4.6)', () => {
    const h = createHarness({ saved: [kitchenLoop], start: 'playfield' });
    const s = h.store.getState();
    s.placePiece('house', 1, 1);
    s.placePiece('pineTree', 2, 1);
    s.undo();
    s.selectPiece(h.store.getState().pieces[0]!.id);
    s.selectTool('roundTree');
    expect(h.store.getState().history.past).toHaveLength(1);
    expect(h.store.getState().history.future).toHaveLength(1);
    h.store.getState().backToMenu();
    h.store.getState().discardAndLeave();

    expect(h.store.getState().openDiorama('loop')).toBe(true);

    const o = h.store.getState();
    expect(o.screen).toBe('playfield');
    expect(o.mode).toBe('build');
    expect(o.dioramaId).toBe('loop');
    expect(o.dioramaName).toBe('Kitchen loop');
    expect(o.setting).toBe('kitchen');
    expect(o.startFacing).toBe(180);
    expect(o.pieces).toEqual(kitchenLoop.pieces);
    expect(o.isDirty).toBe(false);
    expect(o.selectedTool).toBeNull();
    expect(o.selectedPieceId).toBeNull();
    expect(o.history).toEqual({ past: [], future: [] });
    // Nothing from the earlier session can be undone or redone into this diorama.
    expect(o.undo()).toBe(false);
    expect(o.redo()).toBe(false);
    expect(h.store.getState().pieces).toEqual(kitchenLoop.pieces);
    // The parked train follows the opened station and facing.
    expect(h.getTrain()).toMatchObject({ pieceId: 'a', progress: 0.5, moving: false });
  });
});

describe('Escape', () => {
  it('cancels a palette drag first, then clears the tool, without changing pieces (11.8, 11.9)', () => {
    const h = createHarness({ start: 'playfield' });
    h.store.getState().placePiece('house', 0, 0);
    const pieces = h.store.getState().pieces;
    h.audio.clearLog();

    expect(h.store.getState().beginDrag({ source: 'palette', type: 'straight', tile: { gridX: 5, gridZ: 5 } })).toBe(true);
    expect(h.store.getState().drag).not.toBeNull();

    expect(press(h, 'Escape')).toBe('cancelDrag');
    expect(h.store.getState().drag).toBeNull();
    expect(h.store.getState().pieces).toBe(pieces);
    // The drag had set the tool; the first Escape only cancels the drag.
    expect(h.store.getState().selectedTool).toBe('straight');

    expect(press(h, 'Escape')).toBe('clearTool');
    expect(h.store.getState().selectedTool).toBeNull();
    expect(h.store.getState().pieces).toBe(pieces);
    // Escape is a deliberate cancel: only the drag's pickup was logged.
    expect(h.audio.getLog()).toEqual(['pickup']);
  });

  it('returns a board-dragged piece to its tile and records nothing', () => {
    const h = createHarness({ start: 'playfield' });
    const { id } = h.store.getState().placePiece('house', 3, 3) as { ok: true; id: string };
    const pieces = h.store.getState().pieces;
    const past = h.store.getState().history.past.length;

    h.store.getState().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 3 } });
    h.store.getState().setDragTile({ gridX: 8, gridZ: 8 });
    press(h, 'r');
    expect(press(h, 'Escape')).toBe('cancelDrag');

    expect(h.store.getState().drag).toBeNull();
    expect(h.store.getState().pieces).toBe(pieces);
    expect(h.store.getState().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3, rotation: 0 });
    expect(h.store.getState().history.past).toHaveLength(past);
  });

  it('with no drag and a tool selected, clears only the tool', () => {
    const h = createHarness({ start: 'playfield' });
    h.store.getState().selectTool('curve');
    const dirty = h.store.getState().isDirty;
    expect(press(h, 'Escape')).toBe('clearTool');
    expect(h.store.getState().selectedTool).toBeNull();
    expect(h.store.getState().isDirty).toBe(dirty);
    expect(h.audio.getLog()).toEqual([]);
  });
});

describe('R during a drag', () => {
  it('turns the palette ghost and the drop keeps that rotation', () => {
    const h = createHarness({ start: 'playfield' });
    h.store.getState().beginDrag({ source: 'palette', type: 'house', tile: { gridX: 6, gridZ: 6 } });
    expect(press(h, 'r')).toBe('rotateDrag');
    expect(press(h, 'R')).toBe('rotateDrag');
    expect(h.store.getState().drag?.rotation).toBe(180);

    const result = h.store.getState().drop();
    expect(result).toMatchObject({ ok: true });
    expect(h.store.getState().pieces).toEqual([
      { id: 'p1', type: 'house', gridX: 6, gridZ: 6, rotation: 180 },
    ]);
    expect(h.audio.getLog()).toEqual(['pickup', 'rotate', 'rotate', 'place']);
  });

  it('turns a board-dragged piece; the drop is one undoable move with the new rotation', () => {
    const h = createHarness({ start: 'playfield' });
    const { id } = h.store.getState().placePiece('house', 2, 2) as { ok: true; id: string };
    const past = h.store.getState().history.past.length;

    h.store.getState().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 2, gridZ: 2 } });
    h.store.getState().setDragTile({ gridX: 7, gridZ: 4 });
    expect(press(h, 'r')).toBe('rotateDrag');
    // The stored piece does not turn until the drop.
    expect(h.store.getState().pieces[0]!.rotation).toBe(0);
    h.store.getState().drop();

    expect(h.store.getState().pieces[0]).toMatchObject({ id, gridX: 7, gridZ: 4, rotation: 90 });
    expect(h.store.getState().history.past).toHaveLength(past + 1);
    h.store.getState().undo();
    expect(h.store.getState().pieces[0]).toMatchObject({ id, gridX: 2, gridZ: 2, rotation: 0 });
  });
});

describe('station palette lock', () => {
  it('blocks selecting and dragging the station while one exists, and lifts when it is removed (10.7)', () => {
    const h = createHarness({ start: 'playfield' });
    const s = h.store.getState();
    s.selectTool('station');
    const { id } = s.placePiece('station', 5, 5) as { ok: true; id: string };
    s.selectTool('house');
    h.audio.clearLog();

    h.store.getState().selectTool('station');
    expect(h.store.getState().selectedTool).toBe('house');
    expect(h.store.getState().beginDrag({ source: 'palette', type: 'station', tile: { gridX: 8, gridZ: 8 } })).toBe(false);
    expect(h.store.getState().drag).toBeNull();
    expect(h.store.getState().selectedTool).toBe('house');
    expect(h.audio.getLog()).toEqual([]);
    // A second station is also refused at the placement engine.
    expect(h.store.getState().placePiece('station', 8, 8)).toEqual({ ok: false, reason: 'station_limit' });

    h.store.getState().removePiece(id);
    h.store.getState().selectTool('station');
    expect(h.store.getState().selectedTool).toBe('station');

    // Undoing the removal brings the station back, and the lock with it.
    h.store.getState().selectTool('house');
    h.store.getState().undo();
    h.store.getState().selectTool('station');
    expect(h.store.getState().selectedTool).toBe('house');
  });
});

describe('Play mode without a station', () => {
  it('stays in Build mode with the toast, invalid and no_station; works once a station exists (18.2)', () => {
    const h = createHarness({ start: 'playfield' });
    h.store.getState().placePiece('straight', 3, 3);
    h.audio.clearLog();

    expect(h.store.getState().setMode('play')).toEqual({ ok: false, reason: 'no_station' });
    expect(h.store.getState().mode).toBe('build');
    expect(TOAST_NO_STATION).toBe('Place a station to start');
    expect(toastTexts(h)).toEqual(['Place a station to start']);
    expect(h.audio.getLog()).toEqual(['invalid']);
    expect(h.trainCalls.some((c) => c.method === 'enterPlay')).toBe(false);
    expect(h.getTrain()).toBeNull();

    h.store.getState().placePiece('station', 3, 4);
    expect(h.store.getState().setMode('play')).toEqual({ ok: true });
    expect(h.store.getState().mode).toBe('play');
    expect(h.trainCalls.filter((c) => c.method === 'enterPlay')).toHaveLength(1);
  });
});

describe('back to menu', () => {
  it('leaves at once without a dialog when there are no unsaved changes (22.10)', () => {
    const h = createHarness({ saved: [kitchenLoop], start: { open: 'loop' } });
    h.store.getState().backToMenu();
    expect(h.store.getState().dialog).toBeNull();
    expect(h.store.getState().screen).toBe('menu');
    expect(h.store.getState().savedList.map((d) => d.id)).toEqual(['loop']);
  });

  it('Cancel keeps the playfield, pieces, setting and facing, and the diorama dirty (22.6, 22.9)', () => {
    const h = createHarness({ saved: [kitchenLoop], start: { open: 'loop' } });
    h.store.getState().placePiece('house', 12, 12);
    h.store.getState().setSetting('bedroom');
    h.store.getState().flipStartFacing();
    const pieces = h.store.getState().pieces;
    const before = h.storage.getItem(SAVE_KEY);

    h.store.getState().backToMenu();
    expect(h.store.getState().dialog).toEqual({ kind: 'unsaved' });
    expect(h.store.getState().screen).toBe('playfield');
    // A second back request while the dialog is open changes nothing.
    h.store.getState().backToMenu();
    expect(h.store.getState().dialog).toEqual({ kind: 'unsaved' });

    h.store.getState().cancelDialog();
    const s = h.store.getState();
    expect(s.dialog).toBeNull();
    expect(s.screen).toBe('playfield');
    expect(s.pieces).toBe(pieces);
    expect(s.setting).toBe('bedroom');
    expect(s.startFacing).toBe(0);
    expect(s.isDirty).toBe(true);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
  });

  it('Discard shows the menu without writing, listing the diorama as last saved (22.8)', () => {
    const h = createHarness({ saved: [kitchenLoop], start: { open: 'loop' } });
    h.store.getState().removePiece('c');
    h.store.getState().setSetting('bedroom');
    const before = h.storage.getItem(SAVE_KEY);

    h.store.getState().backToMenu();
    h.store.getState().discardAndLeave();

    expect(h.store.getState().screen).toBe('menu');
    expect(h.store.getState().dialog).toBeNull();
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
    expect(h.store.getState().savedList).toEqual([kitchenLoop]);
    // No autosave fires later from the menu.
    h.clock.advance(65_000);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);
  });

  it('Discard of a never-saved diorama leaves no entry', () => {
    const h = createHarness({ start: 'playfield' });
    h.store.getState().placePiece('house', 1, 1);
    h.store.getState().backToMenu();
    h.store.getState().discardAndLeave();
    expect(h.store.getState().screen).toBe('menu');
    expect(h.storage.getItem(SAVE_KEY)).toBeNull();
    expect(h.store.getState().savedList).toEqual([]);
  });

  it('Save writes, then shows the menu with the saved diorama listed (22.7)', () => {
    const h = createHarness({ saved: [kitchenLoop], start: 'playfield' });
    h.store.getState().placePiece('station', 6, 6);
    h.store.getState().placePiece('pineTree', 0, 0);
    const pieces = h.store.getState().pieces;

    h.store.getState().backToMenu();
    h.store.getState().confirmDialog();

    const s = h.store.getState();
    expect(s.screen).toBe('menu');
    expect(s.dialog).toBeNull();
    expect(toastTexts(h)).toEqual([TOAST_SAVED]);
    const entry = s.savedList.find((d) => d.name === 'Untitled diorama');
    expect(entry).toBeDefined();
    expect(entry!.pieces).toEqual(pieces);
    // Newest first: the new save comes before the older kitchen loop.
    expect(s.savedList.map((d) => d.id)).toEqual([entry!.id, 'loop']);
    expect(h.stored().map((d) => d.id)).toEqual(['loop', entry!.id]);
  });

  it('a failed Save keeps the playfield open with every change intact (22.11)', () => {
    const h = createHarness({ saved: [kitchenLoop], start: { open: 'loop' } });
    h.store.getState().placePiece('house', 12, 12);
    h.store.getState().setSetting('bedroom');
    const pieces = h.store.getState().pieces;
    const before = h.storage.getItem(SAVE_KEY);
    h.storage.setFailWrites(true);

    h.store.getState().backToMenu();
    h.store.getState().confirmDialog();

    const s = h.store.getState();
    expect(s.screen).toBe('playfield');
    expect(s.dialog).toBeNull();
    expect(s.isDirty).toBe(true);
    expect(s.pieces).toBe(pieces);
    expect(s.setting).toBe('bedroom');
    expect(toastTexts(h)).toEqual([TOAST_SAVE_FAILED]);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);

    // Once storage works again, the same dialog path saves and leaves.
    h.storage.setFailWrites(false);
    h.store.getState().backToMenu();
    h.store.getState().confirmDialog();
    expect(h.store.getState().screen).toBe('menu');
    expect(h.stored()).toHaveLength(1);
    expect(h.stored()[0]).toMatchObject({ id: 'loop', setting: 'bedroom', pieces });
  });
});

describe('save failure and autosave retry', () => {
  it('a failed autosave toasts, keeps the diorama dirty and retries 30 s later (23.4)', () => {
    const h = createHarness({ start: 'playfield' });
    const start = h.clock.now;
    /** Times of every write attempt to the SaveFile, in ms after `start`. */
    const attempts: number[] = [];
    let failing = true;
    h.storage.setFailWrites((key) => {
      if (key !== SAVE_KEY) return false;
      attempts.push(h.clock.now - start);
      return failing;
    });

    h.store.getState().placePiece('house', 4, 4);
    const pieces = h.store.getState().pieces;

    // A manual save that fails does not move the autosave due time.
    h.clock.advance(10_000);
    expect(h.store.getState().save()).toBe(false);
    expect(toastTexts(h)).toEqual([TOAST_SAVE_FAILED]);
    expect(attempts).toEqual([10_000]);

    h.clock.advance(19_000); // t = 29 s
    expect(attempts).toHaveLength(1);
    h.clock.advance(2_000); // t = 31 s: the first autosave attempt
    expect(attempts).toHaveLength(2);
    const firstAuto = attempts[1]!;
    expect(firstAuto).toBeGreaterThanOrEqual(30_000);
    expect(firstAuto).toBeLessThanOrEqual(31_000);
    expect(h.store.getState().isDirty).toBe(true);
    expect(h.store.getState().pieces).toBe(pieces);
    expect(toastTexts(h)).toContain(TOAST_SAVE_FAILED);
    expect(h.storage.getItem(SAVE_KEY)).toBeNull();

    // The retry is 30 to 31 s after the failed attempt, and it succeeds.
    failing = false;
    h.clock.advance(firstAuto + 29_000 - (h.clock.now - start));
    expect(attempts).toHaveLength(2);
    h.clock.advance(2_000);
    expect(attempts).toHaveLength(3);
    expect(attempts[2]! - firstAuto).toBeGreaterThanOrEqual(30_000);
    expect(attempts[2]! - firstAuto).toBeLessThanOrEqual(31_000);
    expect(h.store.getState().isDirty).toBe(false);
    expect(h.store.getState().dioramaId).not.toBeNull();
    expect(toastTexts(h)).toContain(TOAST_SAVED);
    expect(h.stored()).toHaveLength(1);
    expect(h.stored()[0]!.pieces).toEqual(pieces);

    // Clean again: no more autosave writes.
    h.clock.advance(70_000);
    expect(attempts).toHaveLength(3);
  });
});

describe('thumbnail failure', () => {
  it.each(['throw', 'null'] as const)(
    'when capture %s, the diorama is still saved, without a thumbnail field (6.4)',
    (mode) => {
      const h = createHarness({ start: 'playfield' });
      h.store.getState().placePiece('station', 2, 2);
      h.store.getState().setSetting('kitchen');
      h.store.getState().flipStartFacing();
      expect(h.store.getState().save()).toBe(true);
      expect(h.stored()[0]!.thumbnail).toBe(FAKE_THUMBNAIL);

      h.scene.setThumbnailMode(mode);
      h.store.getState().placePiece('house', 9, 9);
      expect(h.store.getState().save()).toBe(true);

      const entry = h.stored()[0]!;
      expect('thumbnail' in entry).toBe(false);
      expect(entry).toMatchObject({
        name: 'Untitled diorama',
        setting: 'kitchen',
        startFacing: 180,
        pieces: h.store.getState().pieces,
      });
      expect(h.store.getState().isDirty).toBe(false);
      expect(h.store.getState().thumbnail).toBeNull();
      expect(toastTexts(h)).toEqual([TOAST_SAVED, TOAST_SAVED]);
      if (mode === 'throw') expect(h.warnings.length).toBeGreaterThan(0);

      // The menu entry has no thumbnail, so the card shows the placeholder.
      h.store.getState().backToMenu();
      expect(h.store.getState().savedList[0]!.thumbnail).toBeUndefined();
    },
  );
});

describe('rename and delete failures', () => {
  it('a failed rename toasts and keeps the old name in storage and in the list (5.9)', () => {
    const h = createHarness({ saved: [kitchenLoop] });
    h.store.getState().refreshList();
    const before = h.storage.getItem(SAVE_KEY);
    h.storage.setFailWrites(true);

    h.store.getState().startRename('loop');
    expect(h.store.getState().renameDiorama('loop', 'Breakfast line')).toBe(false);

    expect(toastTexts(h)).toEqual([TOAST_RENAME_FAILED]);
    expect(h.store.getState().renamingId).toBeNull();
    expect(h.store.getState().savedList.map((d) => d.name)).toEqual(['Kitchen loop']);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);

    h.storage.setFailWrites(false);
    expect(h.store.getState().renameDiorama('loop', 'Breakfast line')).toBe(true);
    expect(h.store.getState().savedList.map((d) => d.name)).toEqual(['Breakfast line']);
  });

  it('a failed delete toasts and keeps the entry in storage and in the list (5.9)', () => {
    const h = createHarness({
      saved: [kitchenLoop, untitled('u1', 'Untitled diorama', '2026-10-03T08:00:00.000Z')],
    });
    h.store.getState().refreshList();
    const before = h.storage.getItem(SAVE_KEY);
    h.storage.setFailWrites(true);

    h.store.getState().requestDeleteDiorama('loop');
    h.store.getState().confirmDialog();

    expect(h.store.getState().dialog).toBeNull();
    expect(toastTexts(h)).toEqual([TOAST_DELETE_FAILED]);
    expect(h.store.getState().savedList.map((d) => d.id)).toEqual(['u1', 'loop']);
    expect(h.storage.getItem(SAVE_KEY)).toBe(before);

    h.storage.setFailWrites(false);
    h.store.getState().requestDeleteDiorama('loop');
    h.store.getState().confirmDialog();
    expect(h.store.getState().savedList.map((d) => d.id)).toEqual(['u1']);
  });
});
