import { describe, expect, it } from 'vitest';
import type { AudioPort } from '@/audio/types';
import type { SoundEvent } from '@/domain/types';
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
  const place = (...args: Parameters<ReturnType<typeof store.getState>['placePiece']>) => {
    const r = store.getState().placePiece(...args);
    if (!r.ok || r.id === undefined) throw new Error(`setup placement failed: ${JSON.stringify(r)}`);
    return r.id;
  };
  /** Clears the sound log so a test sees only the events it triggers. */
  const clearLog = () => {
    audio.log.length = 0;
  };
  return { store, audio, place, clearLog, s: () => store.getState() };
}

describe('beginDrag', () => {
  it('a palette drag sets selectedTool, starts at 0° and plays pickup once', () => {
    const t = setup();
    expect(t.s().beginDrag({ source: 'palette', type: 'curve' })).toBe(true);
    expect(t.s().selectedTool).toBe('curve');
    expect(t.s().drag).toEqual({
      source: 'palette',
      type: 'curve',
      pieceId: null,
      origin: null,
      rotation: 0,
      tile: null,
      valid: false,
    });
    expect(t.audio.log).toEqual(['pickup']);
  });

  it('a board drag selects the piece and starts from its placement', () => {
    const t = setup();
    const id = t.place('curve', 4, 5, { rotation: 180 });
    t.clearLog();
    expect(t.s().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 4, gridZ: 5 } })).toBe(true);
    expect(t.s().selectedPieceId).toBe(id);
    expect(t.s().drag).toEqual({
      source: 'board',
      type: 'curve',
      pieceId: id,
      origin: { gridX: 4, gridZ: 5, rotation: 180 },
      rotation: 180,
      tile: { gridX: 4, gridZ: 5 },
      valid: true,
    });
    expect(t.audio.log).toEqual(['pickup']);
  });

  it('does nothing and plays nothing for a station palette item while a station exists (10.7)', () => {
    const t = setup();
    t.place('station', 2, 2);
    t.clearLog();
    expect(t.s().beginDrag({ source: 'palette', type: 'station' })).toBe(false);
    expect(t.s().drag).toBeNull();
    expect(t.s().selectedTool).toBeNull();
    expect(t.audio.log).toEqual([]);
  });

  it('ignores unknown types, unknown ids and a second drag', () => {
    const t = setup();
    expect(t.s().beginDrag({ source: 'palette', type: 'dragon' as never })).toBe(false);
    expect(t.s().beginDrag({ source: 'board', pieceId: 'nope' })).toBe(false);
    expect(t.s().beginDrag({ source: 'palette', type: 'house' })).toBe(true);
    expect(t.s().beginDrag({ source: 'palette', type: 'car' })).toBe(false);
    expect(t.s().drag?.type).toBe('house');
    expect(t.audio.log).toEqual(['pickup']);
  });

  it('is ignored in Play mode, and so are the other drag actions', () => {
    const t = setup();
    const id = t.place('station', 2, 2);
    t.store.setState({ mode: 'play' });
    t.clearLog();
    expect(t.s().beginDrag({ source: 'palette', type: 'house' })).toBe(false);
    expect(t.s().beginDrag({ source: 'board', pieceId: id })).toBe(false);
    t.s().setDragTile({ gridX: 1, gridZ: 1 });
    expect(t.s().rotateDrag()).toBe(false);
    expect(t.s().drop()).toBeNull();
    expect(t.s().cancelDrag()).toBe(false);
    expect(t.s().drag).toBeNull();
    expect(t.s().selectedTool).toBeNull();
    expect(t.audio.log).toEqual([]);
  });
});

describe('setDragTile', () => {
  it('tracks the tile and its validity for a palette drag', () => {
    const t = setup();
    t.place('straight', 3, 3);
    t.s().beginDrag({ source: 'palette', type: 'house' });
    t.s().setDragTile({ gridX: 0, gridZ: 0 });
    expect(t.s().drag).toMatchObject({ tile: { gridX: 0, gridZ: 0 }, valid: true });
    t.s().setDragTile({ gridX: 3, gridZ: 3 }); // on_track
    expect(t.s().drag).toMatchObject({ tile: { gridX: 3, gridZ: 3 }, valid: false });
    t.s().setDragTile(null);
    expect(t.s().drag).toMatchObject({ tile: null, valid: false });
  });

  it('treats out-of-grid or non-integer tiles as off the grid', () => {
    const t = setup();
    t.s().beginDrag({ source: 'palette', type: 'straight' });
    t.s().setDragTile({ gridX: 16, gridZ: 0 });
    expect(t.s().drag).toMatchObject({ tile: null, valid: false });
    t.s().setDragTile({ gridX: 1.5, gridZ: 0 });
    expect(t.s().drag).toMatchObject({ tile: null, valid: false });
  });

  it('marks a hill footprint that leaves the grid or covers another piece invalid', () => {
    const t = setup();
    t.place('house', 6, 6);
    t.s().beginDrag({ source: 'palette', type: 'hill' });
    t.s().setDragTile({ gridX: 14, gridZ: 14 });
    expect(t.s().drag?.valid).toBe(true);
    t.s().setDragTile({ gridX: 15, gridZ: 0 });
    expect(t.s().drag?.valid).toBe(false);
    t.s().setDragTile({ gridX: 0, gridZ: 15 });
    expect(t.s().drag?.valid).toBe(false);
    t.s().setDragTile({ gridX: 5, gridZ: 5 }); // south-east tile holds the house
    expect(t.s().drag?.valid).toBe(false);
  });

  it("counts a dragged hill's own tiles as free (16.10)", () => {
    const t = setup();
    const id = t.place('hill', 4, 4);
    t.place('house', 7, 4);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().setDragTile({ gridX: 5, gridZ: 4 });
    expect(t.s().drag?.valid).toBe(true);
    t.s().setDragTile({ gridX: 6, gridZ: 4 }); // would cover the house
    expect(t.s().drag?.valid).toBe(false);
  });

  it('applies the station limit to palette drags only', () => {
    const t = setup();
    const station = t.place('station', 2, 2);
    t.s().beginDrag({ source: 'board', pieceId: station });
    t.s().setDragTile({ gridX: 9, gridZ: 9 });
    expect(t.s().drag?.valid).toBe(true);
  });

  it('does nothing without a drag and plays no sound', () => {
    const t = setup();
    t.s().setDragTile({ gridX: 1, gridZ: 1 });
    expect(t.s().drag).toBeNull();
    expect(t.audio.log).toEqual([]);
  });
});

describe('rotateDrag', () => {
  it('cycles 0 → 90 → 180 → 270 → 0, playing rotate each time', () => {
    const t = setup();
    t.s().beginDrag({ source: 'palette', type: 'curve' });
    t.clearLog();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      expect(t.s().rotateDrag()).toBe(true);
      seen.push(t.s().drag!.rotation);
    }
    expect(seen).toEqual([90, 180, 270, 0]);
    expect(t.audio.log).toEqual(['rotate', 'rotate', 'rotate', 'rotate']);
  });

  it('does not change the stored piece until the drop', () => {
    const t = setup();
    const id = t.place('straight', 1, 1);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().rotateDrag();
    expect(t.s().pieces[0]!.rotation).toBe(0);
    expect(t.s().isDirty).toBe(true); // from the setup placement only
    expect(t.s().history.past).toHaveLength(1);
  });

  it('returns false without a drag and plays nothing', () => {
    const t = setup();
    expect(t.s().rotateDrag()).toBe(false);
    expect(t.audio.log).toEqual([]);
  });
});

describe('drop', () => {
  it('a valid palette drop places the piece with the drag rotation, keeps the tool and plays place', () => {
    const t = setup();
    t.s().beginDrag({ source: 'palette', type: 'straight' });
    t.s().rotateDrag();
    t.s().setDragTile({ gridX: 3, gridZ: 4 });
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: true, id: 'p1' });
    expect(t.s().pieces).toEqual([{ id: 'p1', type: 'straight', gridX: 3, gridZ: 4, rotation: 90 }]);
    expect(t.s().drag).toBeNull();
    expect(t.s().selectedTool).toBe('straight');
    expect(t.s().isDirty).toBe(true);
    expect(t.s().history.past).toHaveLength(1);
    expect(t.audio.log).toEqual(['place']);
  });

  it('applies auto-adjust to a palette drop, logging place then snap without rotate', () => {
    const t = setup();
    t.place('straight', 5, 5, { rotation: 0 }); // connectors N and S
    t.s().beginDrag({ source: 'palette', type: 'straight' });
    t.s().rotateDrag(); // 90°: E and W, would not connect
    t.s().setDragTile({ gridX: 5, gridZ: 6 });
    t.clearLog();
    const r = t.s().drop();
    expect(r?.ok).toBe(true);
    expect(t.s().pieces[1]).toMatchObject({ gridX: 5, gridZ: 6, rotation: 180 });
    expect(t.audio.log).toEqual(['place', 'snap']);
  });

  it('a rejected palette drop plays exactly one invalid and changes nothing', () => {
    const t = setup();
    t.place('house', 2, 2);
    t.s().beginDrag({ source: 'palette', type: 'straight' });
    t.s().setDragTile({ gridX: 2, gridZ: 2 });
    const before = t.s();
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: false, reason: 'occupied' });
    expect(t.s().pieces).toBe(before.pieces);
    expect(t.s().history).toBe(before.history);
    expect(t.s().drag).toBeNull();
    expect(t.audio.log).toEqual(['invalid']);
  });

  it('an off-grid drop plays one invalid, returns out_of_bounds and cancels', () => {
    const t = setup();
    t.s().beginDrag({ source: 'palette', type: 'tunnel' });
    t.s().setDragTile(null);
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(t.s().pieces).toEqual([]);
    expect(t.s().drag).toBeNull();
    expect(t.audio.log).toEqual(['invalid']);
  });

  it('a valid board drop moves the piece with the drag rotation and plays move', () => {
    const t = setup();
    const id = t.place('curve', 1, 1);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().setDragTile({ gridX: 8, gridZ: 9 });
    t.s().rotateDrag();
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: true });
    expect(t.s().pieces).toEqual([{ id, type: 'curve', gridX: 8, gridZ: 9, rotation: 90 }]);
    expect(t.s().history.past).toHaveLength(2);
    expect(t.s().history.past[1]).toMatchObject({
      kind: 'move',
      from: { gridX: 1, gridZ: 1, rotation: 0 },
      to: { gridX: 8, gridZ: 9, rotation: 90 },
    });
    expect(t.s().selectedPieceId).toBe(id);
    expect(t.audio.log).toEqual(['move']);
  });

  it('a board drop onto its own tile with the same rotation plays move and records nothing', () => {
    const t = setup();
    const id = t.place('straight', 3, 3);
    t.s().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 3 } });
    const before = t.s();
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: true });
    expect(t.s().pieces).toEqual(before.pieces);
    expect(t.s().history).toBe(before.history);
    expect(t.audio.log).toEqual(['move']);
  });

  it('a rejected board drop leaves the piece at its origin and plays one invalid (12.3)', () => {
    const t = setup();
    const id = t.place('straight', 3, 3);
    t.place('straight', 6, 6);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().rotateDrag();
    t.s().setDragTile({ gridX: 6, gridZ: 6 });
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: false, reason: 'occupied' });
    expect(t.s().pieces[0]).toEqual({ id, type: 'straight', gridX: 3, gridZ: 3, rotation: 0 });
    expect(t.s().history.past).toHaveLength(2);
    expect(t.audio.log).toEqual(['invalid']);
  });

  it('an off-grid board drop leaves the piece where it was', () => {
    const t = setup();
    const id = t.place('hill', 4, 4);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().setDragTile(null);
    t.clearLog();
    expect(t.s().drop()).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(t.s().pieces[0]).toMatchObject({ id, gridX: 4, gridZ: 4 });
    expect(t.audio.log).toEqual(['invalid']);
  });

  it("moves a hill one tile east onto its own tiles (16.10)", () => {
    const t = setup();
    const id = t.place('hill', 4, 4);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().setDragTile({ gridX: 5, gridZ: 4 });
    expect(t.s().drop()).toEqual({ ok: true });
    expect(t.s().pieces[0]).toMatchObject({ gridX: 5, gridZ: 4 });
  });

  it('returns null without a drag and plays nothing', () => {
    const t = setup();
    expect(t.s().drop()).toBeNull();
    expect(t.audio.log).toEqual([]);
  });
});

describe('cancelDrag', () => {
  it('ends a palette drag without placing, keeps the tool and plays nothing (11.8)', () => {
    const t = setup();
    t.s().beginDrag({ source: 'palette', type: 'car' });
    t.s().setDragTile({ gridX: 2, gridZ: 2 });
    t.clearLog();
    expect(t.s().cancelDrag()).toBe(true);
    expect(t.s().drag).toBeNull();
    expect(t.s().pieces).toEqual([]);
    expect(t.s().selectedTool).toBe('car');
    expect(t.audio.log).toEqual([]);
  });

  it('returns a board piece to its origin placement (12.9)', () => {
    const t = setup();
    const id = t.place('curve', 2, 3, { rotation: 270 });
    const before = t.s();
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.s().setDragTile({ gridX: 9, gridZ: 9 });
    t.s().rotateDrag();
    expect(t.s().cancelDrag()).toBe(true);
    expect(t.s().pieces).toBe(before.pieces);
    expect(t.s().history).toBe(before.history);
  });

  it('returns false without a drag', () => {
    expect(setup().s().cancelDrag()).toBe(false);
  });
});

describe('interaction with other actions', () => {
  it('undo, redo and deleteSelected are ignored during a drag', () => {
    const t = setup();
    const id = t.place('straight', 1, 1);
    t.s().beginDrag({ source: 'board', pieceId: id });
    t.clearLog();
    expect(t.s().undo()).toBe(false);
    expect(t.s().deleteSelected()).toBeNull();
    expect(t.s().pieces).toHaveLength(1);
    expect(t.audio.log).toEqual([]);
  });

  it('leaving the playfield clears an active drag', () => {
    const t = setup();
    t.s().beginDrag({ source: 'palette', type: 'house' });
    t.s().backToMenu();
    expect(t.s().screen).toBe('menu');
    expect(t.s().drag).toBeNull();
  });
});
