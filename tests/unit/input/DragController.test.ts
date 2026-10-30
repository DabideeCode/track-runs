import { describe, expect, it } from 'vitest';
import type { AudioPort } from '@/audio/types';
import { footprintTiles } from '@/domain/grid';
import type { SoundEvent, Tile } from '@/domain/types';
import { DragController, exceedsDragThreshold, type PointerLike, type PointerTarget } from '@/input/DragController';
import { createSaveRepository } from '@/persistence/saveRepository';
import { createSettingsRepository } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import { createAppStore } from '@/store/createAppStore';
import type { AppDeps } from '@/store/ports';

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

/** A minimal event target that records listeners and dispatches plain objects. */
class FakeTarget implements PointerTarget {
  readonly listeners = new Map<string, Set<(e: Event) => void>>();
  addEventListener(type: string, listener: (e: Event) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (e: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  dispatch(type: string, event: Partial<PointerLike> = {}): void {
    for (const l of [...(this.listeners.get(type) ?? [])]) l(event as unknown as Event);
  }
  count(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

/** Tiles are 10 px squares from the canvas origin; anything outside 160 × 160 is off the grid. */
const TILE_PX = 10;
function rayFromClient(x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= 16 * TILE_PX || y >= 16 * TILE_PX) return null;
  return { gridX: Math.floor(x / TILE_PX), gridZ: Math.floor(y / TILE_PX) };
}
/** Client point at the centre of a tile, plus an optional pixel offset. */
function at(gridX: number, gridZ: number, dx = 0, dy = 0) {
  return { clientX: gridX * TILE_PX + 5 + dx, clientY: gridZ * TILE_PX + 5 + dy };
}
const OFF_GRID = { clientX: 500, clientY: 500 };
/** Marks events over an overlay panel. */
const PANEL = { kind: 'panel' };

function setup() {
  const storage = memoryStorage();
  const audio = recordingAudio();
  let n = 0;
  const deps: AppDeps = {
    audio,
    train: { enterPlay: () => {}, exitPlay: () => {}, setDriveMode: () => {}, snapshot: () => null },
    scene: { captureThumbnail: () => null, resetView: () => {} },
    saves: createSaveRepository({ storage, warn: () => {} }),
    settings: createSettingsRepository({ storage, warn: () => {} }),
    now: () => 1_000_000,
    newId: () => `p${++n}`,
    warn: () => {},
  };
  const store = createAppStore(deps);
  store.getState().newDiorama();
  const target = new FakeTarget();
  let uiClicks = 0;
  // The real pick proxies raycast the scene; here a piece is "under" the pointer when its footprint holds the tile.
  const pickPiece = (x: number, y: number): string | null => {
    const tile = rayFromClient(x, y);
    if (tile === null) return null;
    const hit = store
      .getState()
      .pieces.find((p) =>
        footprintTiles(p.type, p.gridX, p.gridZ).some((t) => t.gridX === tile.gridX && t.gridZ === tile.gridZ),
      );
    return hit?.id ?? null;
  };
  const controller = new DragController({
    store,
    bridge: { rayFromClient },
    target,
    pickPiece,
    isOverScene: (e) => e.target !== PANEL,
    playUi: () => {
      uiClicks += 1;
    },
  });
  const detach = controller.attach();
  const place = (...args: Parameters<ReturnType<typeof store.getState>['placePiece']>) => {
    const r = store.getState().placePiece(...args);
    if (!r.ok || r.id === undefined) throw new Error(`setup placement failed: ${JSON.stringify(r)}`);
    return r.id;
  };
  const clearLog = () => {
    audio.log.length = 0;
  };
  const down = (p: Partial<PointerLike>) => target.dispatch('pointerdown', { button: 0, buttons: 1, ...p });
  const move = (p: Partial<PointerLike>) => target.dispatch('pointermove', { buttons: 1, ...p });
  const up = (p: Partial<PointerLike>) => target.dispatch('pointerup', { button: 0, buttons: 0, ...p });
  return {
    store,
    audio,
    target,
    controller,
    detach,
    place,
    clearLog,
    down,
    move,
    up,
    uiClicks: () => uiClicks,
    s: () => store.getState(),
  };
}

describe('exceedsDragThreshold', () => {
  it('is false up to 4 px and true beyond', () => {
    expect(exceedsDragThreshold(3, 0)).toBe(false);
    expect(exceedsDragThreshold(4, 0)).toBe(false);
    expect(exceedsDragThreshold(3, 3)).toBe(true);
    expect(exceedsDragThreshold(0, -5)).toBe(true);
  });
});

describe('palette gestures', () => {
  it('press, move and release over a tile places the item (11.1, 11.2)', () => {
    const t = setup();
    expect(t.controller.paletteDown('house', { ...at(0, 0), target: PANEL })).toBe(true);
    t.down({ ...at(0, 0), target: PANEL }); // bubbles to window; ignored, gesture already active
    t.move({ ...at(0, 0, 6), target: PANEL }); // past the threshold, still over the palette
    expect(t.s().drag).toMatchObject({ source: 'palette', type: 'house', tile: null, valid: false });
    expect(t.s().selectedTool).toBe('house');
    t.move(at(4, 5));
    expect(t.s().drag).toMatchObject({ tile: { gridX: 4, gridZ: 5 }, valid: true });
    t.up(at(4, 5));
    expect(t.s().drag).toBeNull();
    expect(t.s().pieces).toEqual([{ id: 'p1', type: 'house', gridX: 4, gridZ: 5, rotation: 0 }]);
    expect(t.audio.log).toEqual(['pickup', 'place']);
    expect(t.controller.phase.kind).toBe('idle');
  });

  it('uses the tile under the release, not the last move (2.4)', () => {
    const t = setup();
    t.controller.paletteDown('car', { ...at(0, 0), target: PANEL });
    t.move(at(2, 2));
    t.up(at(7, 3));
    expect(t.s().pieces[0]).toMatchObject({ gridX: 7, gridZ: 3 });
  });

  it('a release with movement of 4 px or less is a click: selects the tool and plays ui once', () => {
    const t = setup();
    t.controller.paletteDown('curve', { clientX: 1000, clientY: 1000, target: PANEL });
    t.move({ clientX: 1003, clientY: 1000, target: PANEL });
    t.up({ clientX: 1003, clientY: 1000, target: PANEL });
    expect(t.s().selectedTool).toBe('curve');
    expect(t.s().drag).toBeNull();
    expect(t.s().pieces).toEqual([]);
    expect(t.uiClicks()).toBe(1);
    expect(t.audio.log).toEqual([]);
  });

  it('a drag released off the grid or over a panel plays invalid and places nothing (11.4)', () => {
    const t = setup();
    t.controller.paletteDown('straight', at(0, 0));
    t.move(at(3, 3));
    t.up(OFF_GRID);
    expect(t.s().pieces).toEqual([]);
    expect(t.audio.log).toEqual(['pickup', 'invalid']);

    t.clearLog();
    t.controller.paletteDown('straight', at(0, 0));
    t.move(at(3, 3));
    t.up({ ...at(3, 3), target: PANEL });
    expect(t.s().pieces).toEqual([]);
    expect(t.audio.log).toEqual(['pickup', 'invalid']);
  });

  it('a drag released on an occupied tile plays one invalid', () => {
    const t = setup();
    t.place('house', 3, 3);
    t.clearLog();
    t.controller.paletteDown('car', at(0, 0));
    t.move(at(3, 3));
    expect(t.s().drag?.valid).toBe(false);
    t.up(at(3, 3));
    expect(t.s().pieces).toHaveLength(1);
    expect(t.audio.log).toEqual(['pickup', 'invalid']);
  });

  it('rejects the station item while a station exists (10.7)', () => {
    const t = setup();
    t.place('station', 2, 2);
    t.clearLog();
    expect(t.controller.paletteDown('station', at(0, 0))).toBe(false);
    t.move(at(5, 5));
    t.up(at(5, 5));
    expect(t.s().pieces).toHaveLength(1);
    expect(t.s().selectedTool).toBeNull();
    expect(t.uiClicks()).toBe(0);
    expect(t.audio.log).toEqual([]);
  });

  it('rejects unknown types and non-left buttons', () => {
    const t = setup();
    expect(t.controller.paletteDown('dragon', at(0, 0))).toBe(false);
    expect(t.controller.paletteDown('house', { ...at(0, 0), button: 2 })).toBe(false);
    expect(t.controller.phase.kind).toBe('idle');
  });
});

describe('board gestures', () => {
  it('dragging a placed piece to another tile moves it (12.2)', () => {
    const t = setup();
    const id = t.place('curve', 2, 2, { rotation: 90 });
    t.clearLog();
    t.down(at(2, 2));
    t.move(at(3, 2));
    expect(t.s().drag).toMatchObject({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 2 } });
    expect(t.s().selectedPieceId).toBe(id);
    t.move(at(9, 8));
    t.up(at(9, 8));
    expect(t.s().pieces).toEqual([{ id, type: 'curve', gridX: 9, gridZ: 8, rotation: 90 }]);
    expect(t.audio.log).toEqual(['pickup', 'move']);
  });

  it('R during the drag (rotateDrag) is applied at the release (12.5)', () => {
    const t = setup();
    const id = t.place('straight', 2, 2);
    t.down(at(2, 2));
    t.move(at(5, 5));
    t.s().rotateDrag();
    t.up(at(5, 5));
    expect(t.s().pieces[0]).toEqual({ id, type: 'straight', gridX: 5, gridZ: 5, rotation: 90 });
  });

  it('a click on a piece selects it without moving it (12.1)', () => {
    const t = setup();
    const id = t.place('house', 4, 4);
    t.clearLog();
    t.down(at(4, 4));
    t.move(at(4, 4, 3, 3)); // more than 4 px, but the same tile
    t.up(at(4, 4, 3, 3));
    expect(t.s().selectedPieceId).toBe(id);
    expect(t.s().pieces[0]).toMatchObject({ gridX: 4, gridZ: 4 });
    expect(t.audio.log).toEqual([]);
  });

  it('a 2 px jitter across a tile edge is still a click', () => {
    const t = setup();
    const id = t.place('house', 4, 4);
    t.down({ clientX: 49, clientY: 45 });
    t.move({ clientX: 51, clientY: 45 }); // tile 5, but only 2 px
    t.up({ clientX: 51, clientY: 45 });
    expect(t.s().drag).toBeNull();
    expect(t.s().selectedPieceId).toBe(id);
    expect(t.s().pieces[0]).toMatchObject({ gridX: 4, gridZ: 4 });
  });

  it('a board drag released off the grid plays invalid and leaves the piece (12.3)', () => {
    const t = setup();
    const id = t.place('hill', 4, 4);
    t.clearLog();
    t.down(at(5, 5)); // the hill's south-east tile
    t.move(at(8, 8));
    t.up(OFF_GRID);
    expect(t.s().pieces[0]).toMatchObject({ id, gridX: 4, gridZ: 4 });
    expect(t.audio.log).toEqual(['pickup', 'invalid']);
  });

  it('a press on empty ground with no tool clears the selection', () => {
    const t = setup();
    const id = t.place('house', 4, 4);
    t.s().selectPiece(id);
    t.down(at(10, 10));
    expect(t.s().selectedPieceId).toBeNull();
    t.up(at(10, 10));
    expect(t.s().pieces).toHaveLength(1);
    expect(t.audio.log.filter((e) => e !== 'place')).toEqual([]);
  });
});

describe('clicks with a tool selected', () => {
  it('places the tool on the clicked tile at 0° with auto-adjust and keeps the tool (11.3, 15.1)', () => {
    const t = setup();
    t.place('straight', 5, 5, { rotation: 90 }); // connectors E and W
    t.s().selectTool('straight');
    t.clearLog();
    t.down(at(6, 5));
    t.up(at(6, 5));
    expect(t.s().pieces[1]).toMatchObject({ type: 'straight', gridX: 6, gridZ: 5, rotation: 90 });
    expect(t.s().selectedTool).toBe('straight');
    expect(t.audio.log).toEqual(['place', 'snap']);
  });

  it('a click on an occupied tile plays invalid and keeps the tool (11.10)', () => {
    const t = setup();
    const id = t.place('house', 2, 2);
    t.s().selectTool('car');
    t.clearLog();
    t.down(at(2, 2));
    t.up(at(2, 2));
    expect(t.s().pieces).toHaveLength(1);
    expect(t.s().selectedTool).toBe('car');
    expect(t.s().selectedPieceId).not.toBe(id);
    expect(t.audio.log).toEqual(['invalid']);
  });

  it('a click off the grid does nothing (D-27)', () => {
    const t = setup();
    t.s().selectTool('car');
    t.down(OFF_GRID);
    t.up(OFF_GRID);
    expect(t.s().pieces).toEqual([]);
    expect(t.audio.log).toEqual([]);
  });

  it('presses over an overlay panel are not canvas presses', () => {
    const t = setup();
    t.s().selectTool('car');
    t.down({ ...at(2, 2), target: PANEL });
    t.up(at(2, 2));
    expect(t.s().pieces).toEqual([]);
    expect(t.controller.phase.kind).toBe('idle');
  });
});

describe('buttons, cancellation and mode', () => {
  it('right and middle presses are left to the camera (9.4)', () => {
    const t = setup();
    t.place('house', 4, 4);
    t.s().selectTool('car');
    for (const button of [1, 2]) {
      t.down({ ...at(7, 7), button, buttons: button === 1 ? 4 : 2 });
      t.move({ ...at(9, 9), buttons: button === 1 ? 4 : 2 });
      t.up({ ...at(9, 9), button });
    }
    t.s().selectTool(null);
    t.down({ ...at(4, 4), button: 2, buttons: 2 });
    t.move({ ...at(8, 8), buttons: 2 });
    t.up({ ...at(8, 8), button: 2 });
    expect(t.s().pieces).toHaveLength(1);
    expect(t.s().pieces[0]).toMatchObject({ gridX: 4, gridZ: 4 });
    expect(t.s().drag).toBeNull();
    expect(t.s().selectedPieceId).toBeNull();
  });

  it('a left release reported as a move with buttons 0 ends the gesture (chorded buttons)', () => {
    const t = setup();
    const id = t.place('house', 1, 1);
    t.down(at(1, 1));
    t.move(at(6, 6));
    t.move({ ...at(6, 6), buttons: 2 }); // left released, right still held
    expect(t.s().pieces[0]).toMatchObject({ id, gridX: 6, gridZ: 6 });
    expect(t.controller.phase.kind).toBe('idle');
  });

  it('Escape mid-drag (cancelDrag from the keyboard hook) makes the release do nothing (11.8, 12.9)', () => {
    const t = setup();
    const id = t.place('straight', 2, 2);
    t.clearLog();
    t.down(at(2, 2));
    t.move(at(7, 7));
    t.s().cancelDrag(); // what handleKeyDown does for Escape
    t.move(at(8, 8));
    t.up(at(8, 8));
    expect(t.s().pieces[0]).toMatchObject({ id, gridX: 2, gridZ: 2 });
    expect(t.s().drag).toBeNull();
    expect(t.audio.log).toEqual(['pickup']);
    expect(t.controller.phase.kind).toBe('idle');
  });

  it('pointercancel cancels a drag silently', () => {
    const t = setup();
    t.controller.paletteDown('house', at(0, 0));
    t.move(at(3, 3));
    t.clearLog();
    t.target.dispatch('pointercancel', { pointerId: 1 });
    expect(t.s().drag).toBeNull();
    t.up(at(3, 3));
    expect(t.s().pieces).toEqual([]);
    expect(t.audio.log).toEqual([]);
  });

  it('pointercancel for another pointer is ignored', () => {
    const t = setup();
    t.controller.paletteDown('house', at(0, 0));
    t.move(at(3, 3));
    t.target.dispatch('pointercancel', { pointerId: 7 });
    expect(t.s().drag).not.toBeNull();
  });

  it('window blur cancels a board drag and the piece stays put', () => {
    const t = setup();
    const id = t.place('car', 3, 3);
    t.down(at(3, 3));
    t.move(at(6, 6));
    t.target.dispatch('blur');
    expect(t.s().drag).toBeNull();
    t.up(at(6, 6));
    expect(t.s().pieces[0]).toMatchObject({ id, gridX: 3, gridZ: 3 });
    expect(t.s().hoverTile).toBeNull();
  });

  it('ignores every gesture in Play mode (18.4)', () => {
    const t = setup();
    const station = t.place('station', 2, 2);
    expect(t.s().setMode('play')).toEqual({ ok: true });
    t.clearLog();
    expect(t.controller.paletteDown('house', at(0, 0))).toBe(false);
    t.move(at(5, 5));
    t.up(at(5, 5));
    t.down(at(2, 2));
    t.move(at(6, 6));
    t.up(at(6, 6));
    expect(t.s().pieces).toEqual([{ id: station, type: 'station', gridX: 2, gridZ: 2, rotation: 0 }]);
    expect(t.s().selectedPieceId).toBeNull();
    expect(t.s().drag).toBeNull();
    expect(t.s().hoverTile).toBeNull();
    expect(t.s().hoverPieceId).toBeNull();
    expect(t.audio.log).toEqual([]);
  });

  it('entering Play mode mid-drag ends the gesture without a drop', () => {
    const t = setup();
    t.place('station', 2, 2);
    t.controller.paletteDown('house', at(0, 0));
    t.move(at(5, 5));
    t.s().setMode('play');
    t.up(at(5, 5));
    expect(t.s().pieces).toHaveLength(1);
    expect(t.controller.phase.kind).toBe('idle');
  });

  it('detach removes every listener and cancels the gesture', () => {
    const t = setup();
    expect(t.target.count()).toBe(6);
    t.controller.paletteDown('house', at(0, 0));
    t.move(at(3, 3));
    t.detach();
    expect(t.target.count()).toBe(0);
    expect(t.s().drag).toBeNull();
    t.down(at(3, 3));
    expect(t.controller.phase.kind).toBe('idle');
  });
});

describe('hover', () => {
  it('tracks the tile and the piece under the pointer in Build mode (8.4, 31.9)', () => {
    const t = setup();
    const id = t.place('house', 4, 4);
    t.move({ ...at(1, 2), buttons: 0 });
    expect(t.s().hoverTile).toEqual({ gridX: 1, gridZ: 2 });
    expect(t.s().hoverPieceId).toBeNull();
    t.move({ ...at(4, 4), buttons: 0 });
    expect(t.s().hoverTile).toEqual({ gridX: 4, gridZ: 4 });
    expect(t.s().hoverPieceId).toBe(id);
  });

  it('clears off the grid, over a panel and when the pointer leaves the window (8.6)', () => {
    const t = setup();
    t.move({ ...at(1, 1), buttons: 0 });
    t.move({ ...OFF_GRID, buttons: 0 });
    expect(t.s().hoverTile).toBeNull();
    t.move({ ...at(1, 1), buttons: 0 });
    t.move({ ...at(1, 1), buttons: 0, target: PANEL });
    expect(t.s().hoverTile).toBeNull();
    t.move({ ...at(1, 1), buttons: 0 });
    t.target.dispatch('pointerout', { relatedTarget: {} });
    expect(t.s().hoverTile).toEqual({ gridX: 1, gridZ: 1 });
    t.target.dispatch('pointerout', { relatedTarget: null });
    expect(t.s().hoverTile).toBeNull();
  });

  it('shows no hovered piece during a drag', () => {
    const t = setup();
    t.place('house', 4, 4);
    t.controller.paletteDown('car', at(0, 0));
    t.move(at(4, 4));
    expect(t.s().hoverTile).toEqual({ gridX: 4, gridZ: 4 });
    expect(t.s().hoverPieceId).toBeNull();
  });

  it('uses a picker registered later with setPickPiece', () => {
    const t = setup();
    const id = t.place('house', 4, 4);
    t.controller.setPickPiece(null);
    t.move({ ...at(4, 4), buttons: 0 });
    expect(t.s().hoverPieceId).toBeNull();
    t.controller.setPickPiece(() => id);
    t.move({ ...at(4, 4, 1), buttons: 0 });
    expect(t.s().hoverPieceId).toBe(id);
  });
});

describe('store setHover', () => {
  it('cleans tiles and ids and writes nothing when unchanged', () => {
    const t = setup();
    const id = t.place('house', 4, 4);
    t.s().setHover({ gridX: 16, gridZ: 0 }, 'nope');
    expect(t.s().hoverTile).toBeNull();
    expect(t.s().hoverPieceId).toBeNull();
    t.s().setHover({ gridX: 3, gridZ: 4 }, id);
    const before = t.s();
    t.s().setHover({ gridX: 3, gridZ: 4 }, id);
    expect(t.s()).toBe(before);
    expect(t.s().isDirty).toBe(true); // only from the placement
  });

  it('forces null in Play mode and on the menu', () => {
    const t = setup();
    t.place('station', 2, 2);
    t.s().setMode('play');
    t.s().setHover({ gridX: 1, gridZ: 1 }, null);
    expect(t.s().hoverTile).toBeNull();
    t.s().setMode('build');
    t.s().setHover({ gridX: 1, gridZ: 1 }, null);
    expect(t.s().hoverTile).toEqual({ gridX: 1, gridZ: 1 });
    t.store.setState({ screen: 'menu' });
    t.s().setHover({ gridX: 2, gridZ: 2 }, null);
    expect(t.s().hoverTile).toBeNull();
  });
});
