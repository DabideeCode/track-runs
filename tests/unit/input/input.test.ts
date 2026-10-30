// @vitest-environment jsdom
/**
 * Keyboard and drag handling through real DOM events (task 13.4).
 *
 * `keyboard.test.ts` and `DragController.test.ts` drive the handlers with
 * plain objects. This file attaches the real handlers to jsdom's `window`
 * (`createKeyboardHandler`, `DragController.attach`) and dispatches real
 * `KeyboardEvent`s and `PointerEvent`s that bubble from focused inputs, palette
 * buttons and the canvas, with the store harness and the real `TrainRuntime`.
 *
 * Requirements: 12.9, 13.8, 17.3, 17.10, 21.8.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Tile } from '@/domain/types';
import { DragController } from '@/input/DragController';
import { createKeyboardHandler } from '@/input/useKeyboardShortcuts';
import { createHarness, disposeHarnesses, type Harness } from '../store/harness';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) fn();
  document.body.replaceChildren();
  disposeHarnesses();
});

/** Tiles are 10 px squares from the client origin; outside 160 × 160 is off the grid. */
const TILE_PX = 10;
function rayFromClient(x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= 16 * TILE_PX || y >= 16 * TILE_PX) return null;
  return { gridX: Math.floor(x / TILE_PX), gridZ: Math.floor(y / TILE_PX) };
}
/** Client point at a tile centre. */
function at(gridX: number, gridZ: number) {
  return { clientX: gridX * TILE_PX + 5, clientY: gridZ * TILE_PX + 5 };
}

interface Setup {
  h: Harness;
  canvas: HTMLCanvasElement;
  controller: DragController;
  uiClicks: () => number;
  s: () => ReturnType<Harness['store']['getState']>;
}

/**
 * A playfield on a fresh harness with the keyboard and the drag controller
 * listening on `window`, a canvas element standing in for the 3D view, and
 * `isOverScene` matching the playfield's `(e) => e.target === canvas`.
 */
function setup(): Setup {
  const h = createHarness({ start: 'playfield' });
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  let ui = 0;
  const controller = new DragController({
    store: h.store,
    bridge: { rayFromClient },
    target: window,
    pickPiece: (x, y) => {
      const tile = rayFromClient(x, y);
      if (tile === null) return null;
      const hit = h.store.getState().pieces.find((p) => p.gridX === tile.gridX && p.gridZ === tile.gridZ);
      return hit?.id ?? null;
    },
    isOverScene: (e) => e.target === canvas,
    playUi: () => void ui++,
  });
  cleanups.push(controller.attach());
  cleanups.push(createKeyboardHandler({ store: h.store, train: h.train, target: window }));
  return { h, canvas, controller, uiClicks: () => ui, s: () => h.store.getState() };
}

function key(target: EventTarget, type: 'keydown' | 'keyup', init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

function pointer(
  target: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  init: { clientX: number; clientY: number; buttons?: number },
): void {
  const buttons = init.buttons ?? (type === 'pointerup' ? 0 : 1);
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, ...init, buttons }),
  );
}

function placed(h: Harness, type: string, x: number, z: number, rotation = 0): string {
  const r = h.store.getState().placePiece(type, x, z, { rotation: rotation as 0, autoAdjust: false });
  if (!r.ok || r.id === undefined) throw new Error(`setup placement failed: ${JSON.stringify(r)}`);
  return r.id;
}

describe('keyboard on window', () => {
  it('ignores shortcuts typed into a focused text input or textarea, and handles them after blur', () => {
    const t = setup();
    const id = placed(t.h, 'house', 3, 3);
    t.s().selectPiece(id);
    const before = t.s();

    for (const tag of ['input', 'textarea'] as const) {
      const field = document.createElement(tag);
      document.body.append(field);
      field.focus();
      expect(document.activeElement).toBe(field);
      for (const init of [
        { key: 'r' },
        { key: 'f' },
        { key: 'Escape' },
        { key: 'Delete' },
        { key: 'Backspace' },
        { key: 'z', ctrlKey: true },
        { key: 'z', metaKey: true, shiftKey: true },
      ]) {
        const e = key(field, 'keydown', init);
        expect(e.defaultPrevented).toBe(false); // the text field keeps its own editing keys
      }
      field.blur();
    }

    const after = t.s();
    expect(after.pieces).toBe(before.pieces);
    expect(after.history).toBe(before.history);
    expect(after.selectedPieceId).toBe(id);
    expect(after.startFacing).toBe(0);

    // The same key with the focus back on the page works.
    key(document.body, 'keydown', { key: 'r' });
    expect(t.s().pieces[0]!.rotation).toBe(90);
  });

  it('F held down (auto-repeat) flips the start facing once (17.3)', () => {
    const t = setup();
    key(document.body, 'keydown', { key: 'f' });
    for (let i = 0; i < 5; i++) key(document.body, 'keydown', { key: 'f', repeat: true });
    key(document.body, 'keyup', { key: 'f' });
    expect(t.s().startFacing).toBe(180);
    expect(t.s().isDirty).toBe(true);

    key(document.body, 'keydown', { key: 'F', shiftKey: true });
    key(document.body, 'keydown', { key: 'F', shiftKey: true, repeat: true });
    expect(t.s().startFacing).toBe(0);
  });

  it('F is ignored in Play mode, so the train keeps its facing (17.10)', () => {
    const t = setup();
    placed(t.h, 'station', 8, 8);
    expect(t.s().setMode('play')).toEqual({ ok: true });
    key(document.body, 'keydown', { key: 'f' });
    expect(t.s().startFacing).toBe(0);
    t.s().setMode('build');
    expect(t.s().startFacing).toBe(0);
  });

  it('Ctrl and Cmd both trigger undo and redo, and prevent the browser default (13.8)', () => {
    const t = setup();
    placed(t.h, 'house', 1, 1);
    placed(t.h, 'car', 2, 2);
    const both = t.s().pieces;

    expect(key(document.body, 'keydown', { key: 'z', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(t.s().pieces).toHaveLength(1);
    expect(key(document.body, 'keydown', { key: 'z', metaKey: true }).defaultPrevented).toBe(true);
    expect(t.s().pieces).toHaveLength(0);

    // With Shift held most layouts report an upper-case key.
    expect(key(document.body, 'keydown', { key: 'Z', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.s().pieces).toHaveLength(1);
    expect(key(document.body, 'keydown', { key: 'Z', metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(t.s().pieces).toEqual(both);
    // Undo and redo play no sound (Assumption 40).
    expect(t.h.audio.log).toEqual(['place', 'place']);
  });

  it('W and S are ignored in Build mode', () => {
    const t = setup();
    placed(t.h, 'station', 8, 8);
    key(document.body, 'keydown', { key: 'w' });
    key(document.body, 'keydown', { key: 's' });
    expect(t.h.train.getKeys()).toEqual({ w: false, s: false });
    expect(t.h.getTrain()).toMatchObject({ moving: false, speed: 0 });
  });

  it('W and S are ignored in Auto driving: the run matches one with no keys, and a W from Auto does not carry into Manual (21.8)', () => {
    /** A straight line through the station, long enough for the whole train. */
    function line(h: Harness) {
      for (let z = 3; z <= 13; z++) if (z !== 8) placed(h, 'straight', 8, z);
      placed(h, 'station', 8, 8);
      expect(h.store.getState().setMode('play')).toEqual({ ok: true });
      expect(h.store.getState().driveMode).toBe('auto');
    }
    const t = setup();
    line(t.h);
    const twin = createHarness({ start: 'playfield' });
    line(twin);

    const run = (seconds: number) => {
      for (let i = 0; i < seconds * 60; i++) {
        t.h.tick(1 / 60);
        twin.tick(1 / 60);
      }
    };

    key(document.body, 'keydown', { key: 's' });
    key(document.body, 'keydown', { key: 'w' });
    key(document.body, 'keydown', { key: 'w', repeat: true });
    expect(t.h.train.getKeys()).toEqual({ w: false, s: false });
    run(0.5);
    expect(t.h.getTrain()).toEqual(twin.getTrain());
    expect(t.h.getTrain()).toMatchObject({ moving: true, speed: 1.5 });

    // Switch to Manual without a new W keydown: the train coasts to a stop.
    t.s().setDriveMode('manual');
    twin.store.getState().setDriveMode('manual');
    run(1);
    expect(t.h.getTrain()).toEqual(twin.getTrain());
    expect(t.h.getTrain()).toMatchObject({ moving: false, speed: 0 });

    // A fresh W in Manual does drive it.
    key(document.body, 'keydown', { key: 'w' });
    expect(t.h.train.getKeys()).toEqual({ w: true, s: false });
    run(0.25);
    expect(t.h.getTrain()).toMatchObject({ moving: true });
  });

  it('W and S typed into a focused input do not drive the train in Manual mode', () => {
    const t = setup();
    placed(t.h, 'station', 8, 8);
    t.s().setMode('play');
    t.s().setDriveMode('manual');
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    key(field, 'keydown', { key: 'w' });
    key(field, 'keydown', { key: 's' });
    expect(t.h.train.getKeys()).toEqual({ w: false, s: false });
  });
});

describe('palette press: click or drag', () => {
  /** A palette button whose `onPointerDown` hands the press to the controller, as Palette.tsx does. */
  function paletteButton(t: Setup, type: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.addEventListener('pointerdown', (e) => void t.controller.paletteDown(type, e));
    document.body.append(button);
    return button;
  }

  it('a 3 px move before release is a click: the tool is selected, ui plays, nothing is dragged', () => {
    const t = setup();
    const button = paletteButton(t, 'curve');
    pointer(button, 'pointerdown', { clientX: 300, clientY: 300 });
    pointer(button, 'pointermove', { clientX: 303, clientY: 300 });
    expect(t.s().drag).toBeNull();
    pointer(button, 'pointerup', { clientX: 303, clientY: 300 });

    expect(t.s().selectedTool).toBe('curve');
    expect(t.s().drag).toBeNull();
    expect(t.s().pieces).toEqual([]);
    expect(t.uiClicks()).toBe(1);
    expect(t.h.audio.log).toEqual([]);
    expect(t.controller.phase.kind).toBe('idle');
  });

  it('a 5 px move starts a drag (pickup), and releasing over a tile places the piece', () => {
    const t = setup();
    const button = paletteButton(t, 'house');
    pointer(button, 'pointerdown', { clientX: 300, clientY: 300 });
    pointer(button, 'pointermove', { clientX: 305, clientY: 300 });
    expect(t.s().drag).toMatchObject({ source: 'palette', type: 'house', tile: null });
    expect(t.h.audio.log).toEqual(['pickup']);

    pointer(t.canvas, 'pointermove', at(6, 7));
    pointer(t.canvas, 'pointerup', at(6, 7));
    expect(t.s().drag).toBeNull();
    expect(t.s().pieces).toMatchObject([{ type: 'house', gridX: 6, gridZ: 7, rotation: 0 }]);
    expect(t.h.audio.log).toEqual(['pickup', 'place']);
    expect(t.uiClicks()).toBe(0);
  });
});

describe('board drag', () => {
  it('Escape during a board drag returns the piece; the release then does nothing (12.9)', () => {
    const t = setup();
    const id = placed(t.h, 'straight', 2, 2, 90);
    const historyBefore = t.s().history;
    t.h.audio.clearLog();

    pointer(t.canvas, 'pointerdown', at(2, 2));
    pointer(t.canvas, 'pointermove', at(7, 7));
    key(document.body, 'keydown', { key: 'r' }); // rotate during the drag
    expect(t.s().drag).toMatchObject({ source: 'board', pieceId: id, tile: { gridX: 7, gridZ: 7 }, rotation: 180 });

    key(document.body, 'keydown', { key: 'Escape' });
    expect(t.s().drag).toBeNull();
    pointer(t.canvas, 'pointermove', at(9, 9));
    pointer(t.canvas, 'pointerup', at(9, 9));

    expect(t.s().pieces).toEqual([{ id, type: 'straight', gridX: 2, gridZ: 2, rotation: 90 }]);
    expect(t.s().history).toBe(historyBefore);
    expect(t.h.audio.log).toEqual(['pickup', 'rotate']);
    expect(t.controller.phase.kind).toBe('idle');

    // The next gesture works normally.
    pointer(t.canvas, 'pointerdown', at(2, 2));
    pointer(t.canvas, 'pointermove', at(4, 2));
    pointer(t.canvas, 'pointerup', at(4, 2));
    expect(t.s().pieces[0]).toMatchObject({ id, gridX: 4, gridZ: 2, rotation: 90 });
  });
});
