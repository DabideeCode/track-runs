/**
 * Unit tests for `src/scene/pieces/activePieceMotion.ts`: the motion of the
 * selected piece, the dragged piece, the palette ghost and deleted pieces,
 * and the director that turns real store transitions into those motions.
 *
 * Requirements: 11.1, 11.5, 11.6, 12.1, 31.1, 31.2, 31.3, 31.4, 31.5, 31.6,
 * 31.7, 31.8, 31.10, 31.11
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Piece } from '@/domain/types';
import {
  DROP_DURATION,
  LIFT_HEIGHT,
  MAX_TILT_DEG,
  RETURN_DURATION,
  SHAKE_DURATION,
} from '@/scene/animation/tactile';
import {
  ActivePieceDirector,
  ExitMotion,
  PieceMotion,
  blobPlacement,
  boardDropOutcome,
  clampFrameDt,
  ghostDropOutcome,
  isUndoStep,
  outlineColourFor,
  pieceActorKey,
  removedByDelete,
  restFor,
  type ActorFrame,
} from '@/scene/pieces/activePieceMotion';
import { activePieceIds, pieceRestTransform, staticPieces } from '@/scene/pieces/pieceLayout';
import type { DragState } from '@/store/types';
import { TOKENS } from '@/theme/palette';
import { createHarness, disposeHarnesses, type Harness } from '../store/harness';

const FRAME = 1 / 60;
const DEG = Math.PI / 180;

afterEach(() => disposeHarnesses());

/** Steps a motion for `seconds` at 60 fps; returns the pose after each frame. */
function runMotion(m: PieceMotion, start: number, seconds: number) {
  const out: Array<ReturnType<PieceMotion['sample']> & { t: number }> = [];
  let now = start;
  const frames = Math.round(seconds / FRAME);
  for (let i = 0; i < frames; i++) {
    now += FRAME;
    m.advance(now, FRAME);
    out.push({ ...m.sample(now), t: now - start });
  }
  return { poses: out, now };
}

const rest0 = pieceRestTransform({ type: 'straight', gridX: 3, gridZ: 3, rotation: 0 });

describe('PieceMotion', () => {
  it('lifts to 0.3 tiles within 150 ms and grows and softens the shadow (31.1)', () => {
    const m = new PieceMotion(rest0);
    m.grab(0);
    const { poses } = runMotion(m, 0, 0.2);
    const at150 = poses.find((p) => p.t >= 0.15 - 1e-9)!;
    expect(at150.y).toBeCloseTo(LIFT_HEIGHT, 6);
    expect(poses[0]!.y).toBeGreaterThan(0);
    expect(poses[0]!.y).toBeLessThan(LIFT_HEIGHT);
    const shape = { cx: 0, cz: 0, width: 0.5, depth: 1 };
    const lifted = blobPlacement(shape, at150);
    expect(lifted.width).toBeCloseTo(0.7, 6);
    expect(lifted.depth).toBeCloseTo(1.4, 6);
    expect(lifted.opacity).toBeCloseTo(0.6, 6);
    const resting = blobPlacement(shape, new PieceMotion(rest0).sample(0));
    expect(resting).toMatchObject({ width: 0.5, depth: 1, opacity: 1 });
  });

  it('follows a new target, settles within 250 ms and then holds still (31.2)', () => {
    const m = new PieceMotion(rest0);
    m.grab(0);
    const target = restFor('straight', { gridX: 10, gridZ: 3 }, 0);
    m.setTarget(target.x, target.z);
    const { poses } = runMotion(m, 0, 0.5);
    const settled = poses.filter((p) => p.t <= 0.25 + 1e-9).at(-1)!;
    expect(settled.x).toBe(target.x);
    expect(settled.z).toBe(target.z);
    for (const p of poses.filter((q) => q.t > 0.25)) {
      expect(p.x).toBe(target.x);
      expect(p.z).toBe(target.z);
    }
  });

  it('tilts toward the motion by at most 8° and eases back to 0° (31.3)', () => {
    const m = new PieceMotion(rest0);
    m.grab(0);
    m.setTarget(rest0.x + 12, rest0.z);
    const { poses } = runMotion(m, 0, 1);
    const tilts = poses.map((p) => Math.hypot(p.tiltX, p.tiltZ));
    expect(Math.max(...tilts)).toBeGreaterThan(1 * DEG);
    for (const t of tilts) expect(t).toBeLessThanOrEqual(MAX_TILT_DEG * DEG + 1e-12);
    // Moving +x: the top leans toward +x, a negative rotation about Z.
    expect(poses[2]!.tiltZ).toBeLessThan(0);
    expect(tilts.at(-1)!).toBeLessThan(0.01 * DEG);
  });

  it('a valid drop rests on the tile with 0 tilt in under 300 ms (31.4)', () => {
    const m = new PieceMotion(rest0);
    m.grab(0);
    const target = restFor('straight', { gridX: 4, gridZ: 3 }, 0);
    m.setTarget(target.x, target.z);
    const { now } = runMotion(m, 0, 0.05);
    m.drop(now, target, 0);
    const { poses } = runMotion(m, now, 0.4);
    const before = poses.filter((p) => p.t < 0.06);
    expect(before.every((p) => p.y > 0)).toBe(true);
    const after = poses.filter((p) => p.t >= DROP_DURATION + 1e-9);
    for (const p of after) {
      expect(p).toMatchObject({ x: target.x, z: target.z, y: 0, tiltX: 0, tiltZ: 0 });
    }
    expect(DROP_DURATION).toBeLessThan(0.3);
  });

  it('an invalid drop shakes for 200 ms, then eases back to the old tile and rotation (31.5)', () => {
    const m = new PieceMotion(rest0);
    m.grab(0);
    m.rotate(0, 90, true);
    m.setTarget(rest0.x + 3, rest0.z);
    const { now } = runMotion(m, 0, 0.3);
    const xAtRelease = m.x;
    m.shakeAndReturn(now, rest0, 0);
    const { poses } = runMotion(m, now, SHAKE_DURATION + RETURN_DURATION + 0.1);
    const shaking = poses.filter((p) => p.t < SHAKE_DURATION);
    expect(Math.max(...shaking.map((p) => Math.abs(p.x - xAtRelease)))).toBeGreaterThan(0.02);
    expect(shaking.every((p) => p.y === LIFT_HEIGHT)).toBe(true);
    const end = poses.at(-1)!;
    expect(end.x).toBeCloseTo(rest0.x, 9);
    expect(end.z).toBeCloseTo(rest0.z, 9);
    expect(end.y).toBe(0);
    // Back to 0° (a multiple of 360° in the cumulative angle).
    expect(Math.abs(Math.sin(end.yaw))).toBeLessThan(1e-9);
    expect(Math.cos(end.yaw)).toBeCloseTo(1, 9);
    // Eased, not a jump: the return passes through intermediate positions.
    const returning = poses.filter((p) => p.t > SHAKE_DURATION && p.t < SHAKE_DURATION + RETURN_DURATION);
    expect(returning.some((p) => p.x > rest0.x + 0.1 && p.x < xAtRelease - 0.1)).toBe(true);
  });

  it('a rotation turns 90° clockwise over 150 ms to the cumulative angle (31.7)', () => {
    const m = new PieceMotion(pieceRestTransform({ type: 'curve', gridX: 0, gridZ: 0, rotation: 270 }));
    expect(m.yawTargetDeg).toBe(-270);
    m.rotate(0, 0, true);
    expect(m.yawTargetDeg).toBe(-360);
    const { poses } = runMotion(m, 0, 0.25);
    const mid = poses.find((p) => p.t >= 0.05)!;
    expect(mid.yaw).toBeLessThan(-270 * DEG);
    expect(mid.yaw).toBeGreaterThan(-360 * DEG);
    const done = poses.filter((p) => p.t >= 0.15 + 1e-9);
    for (const p of done) expect(p.yaw).toBeCloseTo(-2 * Math.PI, 12);
  });

  it('jumps for a non-animated rotation and for snapTo (31.11)', () => {
    const m = new PieceMotion(rest0);
    m.rotate(0, 90, false);
    expect(m.sample(0).yaw).toBeCloseTo(-90 * DEG, 12);
    const far = restFor('straight', { gridX: 12, gridZ: 12 }, 180);
    m.snapTo(far, 180);
    expect(m.sample(0)).toMatchObject({ x: far.x, z: far.z, y: 0 });
    expect(Math.cos(m.sample(0).yaw)).toBeCloseTo(-1, 12);
  });
});

describe('ExitMotion', () => {
  it('shrinks to 0.6, rises 0.2 and fades to 0 over 200 ms (31.8)', () => {
    const e = new ExitMotion({ x: 1, y: 0, z: 2, yaw: 0 }, 5);
    expect(e.sample(5)).toMatchObject({ scale: 1, y: 0, opacity: 1 });
    const mid = e.sample(5.1);
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(1);
    expect(e.done(5.19)).toBe(false);
    const end = e.sample(5.2);
    expect(end.scale).toBeCloseTo(0.6, 12);
    expect(end.y).toBeCloseTo(0.2, 12);
    expect(end.opacity).toBe(0);
    expect(e.done(5.2)).toBe(true);
  });
});

describe('pure decisions', () => {
  const drag = (over: Partial<DragState>): DragState => ({
    source: 'board',
    type: 'straight',
    pieceId: 'a',
    origin: { gridX: 3, gridZ: 3, rotation: 0 },
    rotation: 0,
    tile: { gridX: 5, gridZ: 3 },
    valid: true,
    ...over,
  });
  const at = (gridX: number, gridZ: number, rotation: Piece['rotation'] = 0): Piece => ({
    id: 'a',
    type: 'straight',
    gridX,
    gridZ,
    rotation,
  });

  it('classifies board releases', () => {
    expect(boardDropOutcome(drag({}), at(5, 3))).toBe('drop');
    expect(boardDropOutcome(drag({ tile: { gridX: 3, gridZ: 3 } }), at(3, 3))).toBe('drop');
    expect(boardDropOutcome(drag({}), at(3, 3))).toBe('cancel');
    expect(boardDropOutcome(drag({ valid: false }), at(3, 3))).toBe('invalid');
    expect(boardDropOutcome(drag({ tile: null, valid: false }), at(3, 3))).toBe('invalid');
    expect(boardDropOutcome(drag({ rotation: 90 }), at(5, 3, 0))).toBe('cancel');
  });

  it('classifies palette releases', () => {
    const d = drag({ source: 'palette', pieceId: null, origin: null, type: 'house' });
    const house: Piece = { id: 'n', type: 'house', gridX: 5, gridZ: 3, rotation: 0 };
    expect(ghostDropOutcome(d, new Set(), [house])).toBe('placed');
    expect(ghostDropOutcome(d, new Set(['n']), [house])).toBe('cancel');
    expect(ghostDropOutcome({ ...d, valid: false }, new Set(), [])).toBe('invalid');
  });

  it('detects undo steps only', () => {
    const e = { kind: 'rotate' as const, id: 'a', from: 0 as const, to: 90 as const };
    expect(isUndoStep({ past: [e], future: [] }, { past: [], future: [e] })).toBe(true);
    expect(isUndoStep({ past: [], future: [e] }, { past: [e], future: [] })).toBe(false);
    expect(isUndoStep({ past: [], future: [] }, { past: [e], future: [] })).toBe(false);
  });

  it('outlines only the selected piece, green or red while it is board-dragged (12.1)', () => {
    expect(outlineColourFor({ drag: null, selectedPieceId: 'a' }, 'a')).toBe(TOKENS.selectionOutline.hex);
    expect(outlineColourFor({ drag: null, selectedPieceId: 'a' }, 'b')).toBeNull();
    expect(outlineColourFor({ drag: drag({}), selectedPieceId: 'a' }, 'a')).toBe(TOKENS.ghostValid.hex);
    expect(outlineColourFor({ drag: drag({ valid: false }), selectedPieceId: 'a' }, 'a')).toBe(TOKENS.ghostInvalid.hex);
    expect(outlineColourFor({ drag: drag({ tile: null }), selectedPieceId: 'a' }, 'a')).toBe(TOKENS.ghostInvalid.hex);
  });

  it('clamps frame times', () => {
    expect(clampFrameDt(Number.NaN)).toBe(0);
    expect(clampFrameDt(-1)).toBe(0);
    expect(clampFrameDt(0.5)).toBe(0.1);
    expect(clampFrameDt(FRAME)).toBe(FRAME);
  });
});

// ---------------------------------------------------------------------------
// Director on a real store
// ---------------------------------------------------------------------------

interface Rig {
  h: Harness;
  d: ActivePieceDirector;
  s: () => ReturnType<Harness['store']['getState']>;
  frames(seconds: number, key: string): Array<ActorFrame | null>;
  keys(): string[];
}

function rig(): Rig {
  const h = createHarness({ start: 'playfield' });
  const d = new ActivePieceDirector(h.store.getState());
  h.store.subscribe((state) => d.update(state));
  return {
    h,
    d,
    s: () => h.store.getState(),
    frames(seconds, key) {
      const out: Array<ActorFrame | null> = [];
      for (let i = 0; i < Math.round(seconds / FRAME); i++) {
        d.advance(FRAME);
        out.push(d.frame(key));
      }
      return out;
    },
    keys: () => d.actors().map((a) => a.key),
  };
}

describe('ActivePieceDirector', () => {
  it('draws exactly the active pieces that the static layers leave out (12.1, D-47)', () => {
    const t = rig();
    t.s().placePiece('straight', 3, 3);
    t.s().placePiece('house', 8, 8);
    const a = t.s().pieces[0]!.id;
    expect(t.keys()).toEqual([]);
    t.s().selectPiece(a);
    expect(t.keys()).toEqual([pieceActorKey(a)]);
    const s = t.s();
    const active = activePieceIds(s.pieces, s);
    expect(active).toEqual([a]);
    expect(staticPieces(s.pieces, s).map((p) => p.id)).not.toContain(a);
    t.s().selectPiece(null);
    expect(t.keys()).toEqual([]);
  });

  it('lifts, follows and drops a board-dragged piece onto the new tile (31.1, 31.2, 31.4)', () => {
    const t = rig();
    t.s().placePiece('straight', 3, 3);
    const id = t.s().pieces[0]!.id;
    expect(t.s().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 3 } })).toBe(true);
    const key = pieceActorKey(id);
    const lift = t.frames(0.15, key);
    expect(lift.at(-1)!.y).toBeCloseTo(LIFT_HEIGHT, 6);
    t.s().setDragTile({ gridX: 6, gridZ: 3 });
    const follow = t.frames(0.25, key);
    const target = restFor('straight', { gridX: 6, gridZ: 3 }, 0);
    expect(follow.at(-1)!.x).toBe(target.x);
    expect(follow.at(-1)!.valid).toBe(true);
    expect(t.s().drop()).toEqual({ ok: true });
    const drop = t.frames(0.3, key);
    expect(drop[0]!.y).toBeGreaterThan(0);
    expect(drop.at(-1)).toMatchObject({ x: target.x, z: target.z, y: 0, tiltX: 0, tiltZ: 0 });
    expect(t.keys()).toEqual([key]); // still selected
  });

  it('shakes an invalid board drop and eases it back to its old tile (31.5, 12.3)', () => {
    const t = rig();
    t.s().placePiece('straight', 3, 3);
    t.s().placePiece('house', 6, 3);
    const id = t.s().pieces[0]!.id;
    t.s().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 3 } });
    const key = pieceActorKey(id);
    t.s().setDragTile({ gridX: 6, gridZ: 3 });
    t.frames(0.3, key);
    expect(t.d.frame(key)!.valid).toBe(false);
    t.s().drop();
    expect(t.s().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3 });
    const xs = t.frames(SHAKE_DURATION + RETURN_DURATION + 0.05, key);
    const target = restFor('house', { gridX: 6, gridZ: 3 }, 0);
    const shaking = xs.slice(0, Math.floor(SHAKE_DURATION / FRAME));
    expect(shaking.some((f) => Math.abs(f!.x - target.x) > 0.02)).toBe(true);
    expect(xs.at(-1)).toMatchObject({ x: rest0.x, z: rest0.z, y: 0 });
  });

  it('eases an Escape-cancelled board drag back without a shake', () => {
    const t = rig();
    t.s().placePiece('straight', 3, 3);
    const id = t.s().pieces[0]!.id;
    t.s().beginDrag({ source: 'board', pieceId: id, tile: { gridX: 3, gridZ: 3 } });
    const key = pieceActorKey(id);
    t.s().setDragTile({ gridX: 5, gridZ: 3 });
    t.frames(0.3, key);
    const target = restFor('straight', { gridX: 5, gridZ: 3 }, 0);
    t.s().cancelDrag();
    const back = t.frames(RETURN_DURATION + 0.05, key);
    // Monotonic return: never moves past the drag target (no shake).
    for (const f of back) {
      expect(f!.x).toBeLessThanOrEqual(target.x + 1e-12);
      expect(f!.x).toBeGreaterThanOrEqual(rest0.x - 1e-12);
    }
    expect(back.at(-1)).toMatchObject({ x: rest0.x, y: 0 });
  });

  it('shows a tinted ghost and hands a valid drop to PieceLayer (11.1, 11.5, D-47)', () => {
    const t = rig();
    t.s().beginDrag({ source: 'palette', type: 'house', tile: null });
    const ghost = t.keys()[0]!;
    expect(ghost).toMatch(/^ghost:/);
    expect(t.d.frame(ghost)!.visible).toBe(false);
    t.s().setDragTile({ gridX: 4, gridZ: 4 });
    const f = t.frames(0.3, ghost).at(-1)!;
    expect(f).toMatchObject({ visible: true, valid: true, x: restFor('house', { gridX: 4, gridZ: 4 }, 0).x });
    expect(f.y).toBeCloseTo(LIFT_HEIGHT, 6);
    expect(t.s().drop()).toMatchObject({ ok: true });
    t.d.advance(FRAME);
    expect(t.keys()).toEqual([]);
  });

  it('tints the ghost red on an invalid tile, shakes it and fades it out on release (11.6, 31.6)', () => {
    const t = rig();
    t.s().placePiece('straight', 4, 4);
    t.s().beginDrag({ source: 'palette', type: 'house', tile: { gridX: 4, gridZ: 4 } });
    const ghost = t.keys()[0]!;
    t.frames(0.2, ghost);
    expect(t.d.frame(ghost)!.valid).toBe(false);
    expect(t.s().drop()).toEqual({ ok: false, reason: 'on_track' });
    expect(t.s().pieces).toHaveLength(1);
    const frames = t.frames(SHAKE_DURATION + RETURN_DURATION + 0.05, ghost);
    const shaking = frames.slice(0, Math.floor(SHAKE_DURATION / FRAME) - 1);
    expect(shaking.every((f) => f !== null && f.opacity === 1)).toBe(true);
    const x0 = restFor('house', { gridX: 4, gridZ: 4 }, 0).x;
    expect(shaking.some((f) => Math.abs(f!.x - x0) > 0.02)).toBe(true);
    const fading = frames.filter((f) => f !== null && f.opacity > 0 && f.opacity < 1);
    expect(fading.length).toBeGreaterThan(1);
    expect(frames.at(-1)).toBeNull();
    expect(t.keys()).toEqual([]);
  });

  it('turns the selected piece on R and applies undo at once (31.7, 31.11)', () => {
    const t = rig();
    t.s().placePiece('curve', 3, 3, { rotation: 0, autoAdjust: false });
    const id = t.s().pieces[0]!.id;
    t.s().selectPiece(id);
    const key = pieceActorKey(id);
    t.s().rotatePiece(id);
    const turn = t.frames(0.2, key);
    expect(turn[0]!.yaw).toBeLessThan(0);
    expect(turn[0]!.yaw).toBeGreaterThan(-90 * DEG);
    expect(turn.at(-1)!.yaw).toBeCloseTo(-90 * DEG, 12);
    expect(t.s().undo()).toBe(true);
    expect(t.d.frame(key)!.yaw).toBeCloseTo(0, 12);
  });

  it('snaps an undone move of the selected piece in one frame (31.11)', () => {
    const t = rig();
    t.s().placePiece('straight', 3, 3);
    const id = t.s().pieces[0]!.id;
    t.s().movePiece(id, 9, 9);
    t.s().selectPiece(id);
    const key = pieceActorKey(id);
    t.frames(0.1, key);
    expect(t.s().undo()).toBe(true);
    expect(t.d.frame(key)).toMatchObject({ x: rest0.x, z: rest0.z, y: 0 });
  });

  it('plays a 200 ms exit copy for a deleted piece but not for an undone placement (31.8)', () => {
    const t = rig();
    t.s().placePiece('house', 5, 5);
    const id = t.s().pieces[0]!.id;
    t.s().selectPiece(id);
    t.s().deleteSelected();
    const exit = t.keys().find((k) => k.startsWith('exit:'))!;
    expect(exit).toBeDefined();
    expect(t.keys()).not.toContain(pieceActorKey(id));
    const frames = t.frames(0.25, exit);
    expect(frames[0]!.opacity).toBeLessThan(1);
    expect(frames.at(-1)).toBeNull();

    t.s().undo(); // the piece comes back (PieceLayer animates its return)
    t.s().undo(); // undo the placement: removed with no exit copy
    expect(t.s().pieces).toEqual([]);
    expect(t.keys()).toEqual([]);
  });

  it('removedByDelete ignores undo and opening another diorama', () => {
    const t = rig();
    t.s().placePiece('house', 5, 5);
    const before = t.s();
    t.s().undo();
    expect(removedByDelete(before, t.s())).toBeNull();
  });

  it('clears ghosts and active pieces in Play mode', () => {
    const t = rig();
    t.s().placePiece('station', 3, 3);
    const id = t.s().pieces[0]!.id;
    t.s().selectPiece(id);
    t.s().beginDrag({ source: 'palette', type: 'house', tile: { gridX: 8, gridZ: 8 } });
    expect(t.keys()).toHaveLength(2);
    expect(t.s().setMode('play')).toEqual({ ok: true });
    t.d.advance(FRAME);
    expect(t.keys()).toEqual([]);
  });
});
