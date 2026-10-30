/**
 * Motion rules for the active piece layer (task 14.12; design.md sections 7.4
 * and 8; Requirements 11.1, 11.5, 11.6, 12.1, 31.1 to 31.8, 31.10, 31.11).
 *
 * No React, Three.js or DOM imports, so everything here runs in Node tests.
 * `ActivePiece.tsx` feeds store snapshots to an `ActivePieceDirector` from a
 * store subscription, calls `advance(dt)` once per frame and writes each
 * actor's `frame()` into Three.js objects. No React state changes per frame;
 * React only re-renders when the set of actors changes.
 *
 * Actors:
 * - `piece:<id>`: an active piece (selected or board-dragged, `isActivePiece`),
 *   drawn with its real materials and, when selected, an outline.
 * - `ghost:<n>`: the palette ghost of drag n, tinted from `drag.valid`. A
 *   released ghost lives on only while it shakes and fades out.
 * - `exit:<id>:<n>`: the 200 ms copy of a deleted piece (scale 0.6, rise 0.2,
 *   fade to 0).
 *
 * Gestures, from the store transitions the director sees:
 * - Drag start: lift to 0.3 tiles in 120 ms, then follow the snapped tile
 *   centre with the critically damped drag spring (D-34) and tilt toward the
 *   horizontal velocity (at most 8°).
 * - `drop()` and `cancelDrag()` both clear `drag` first, so the outcome is
 *   decided on the next frame, once the store has settled (D-49):
 *   - board piece now at the drag tile and rotation: valid drop, fall and
 *     bounce in under 300 ms;
 *   - drag was over a valid tile but the piece did not move: Escape, ease
 *     back with no shake;
 *   - otherwise (invalid tile or off the grid): shake 200 ms, then ease back
 *     to the previous tile and rotation.
 *   - palette ghost: a new piece at the drag tile means a valid drop; the
 *     ghost goes at once and `PieceLayer` plays the fall (D-47). Otherwise
 *     the ghost fades out, after a shake when the tile was invalid.
 * - R: a clockwise step turns over 150 ms to the cumulative angle.
 * - Delete: a piece that leaves `pieces` through a recorded `remove` entry
 *   (Delete, the delete button, the test hook, or redo) gets an exit copy.
 * - Undo: changes apply at once, with no animation (Requirement 31.11).
 *   Redo is not distinguishable from a new action in every case, so it uses
 *   the normal animations, which Requirement 31.11 also allows (D-49).
 * - A selected piece moved or rotated by the test hook slides with the bounce
 *   or turns, like `PieceLayer` does for static pieces.
 */
import type { History } from '@/domain/history';
import { MAX_FRAME_DT } from '@/domain/train';
import type { Piece, PieceType, Rotation, Tile } from '@/domain/types';
import { smoothTowards, springStepVec } from '@/scene/animation/spring';
import {
  DELETE_DURATION,
  DRAG_SPRING,
  DROP_DURATION,
  DROP_FALL_DURATION,
  GRAB_SHADOW_OPACITY,
  GRAB_SHADOW_SCALE,
  HOVER_DURATION,
  HOVER_LIFT,
  LIFT_DURATION,
  LIFT_HEIGHT,
  RETURN_DURATION,
  ROTATE_DURATION,
  SHAKE_DURATION,
  TILT_EASE_TAU,
  degToRad,
  deleteFrame,
  dropHeight,
  easeInOutCubic,
  easeOutCubic,
  rotationTargetFor,
  shakeOffset,
  tiltRotation,
  tween,
} from '@/scene/animation/tactile';
import type { DragState, Screen } from '@/store/types';
import { TOKENS } from '@/theme/palette';
import { activePieceIds, isHoverLifted, pieceRestTransform, type RestTransform } from './pieceLayout';

// ---------------------------------------------------------------------------
// Tweens on the director clock
// ---------------------------------------------------------------------------

/** One eased value on the director clock. `start` may lie in the future (a delayed start). */
export interface ClockTween {
  from: number;
  to: number;
  start: number;
  duration: number;
  ease: (u: number) => number;
}

export function clockTween(
  from: number,
  to: number,
  start: number,
  duration: number,
  ease: (u: number) => number = easeOutCubic,
): ClockTween {
  return { from, to, start, duration, ease };
}

/** A tween that holds `value` from now on. */
const hold = (value: number): ClockTween => clockTween(value, value, 0, 0);

/** Value of a tween at clock time `now`: `from` before the start, `to` after the end. */
export function sampleTween(tw: ClockTween, now: number): number {
  if (now <= tw.start) return tw.from;
  return tween(tw.from, tw.to, now - tw.start, tw.duration, tw.ease);
}

/** True once the tween has reached its end value. */
export function tweenDone(tw: ClockTween, now: number): boolean {
  return now - tw.start >= tw.duration;
}

/** The frame time the director advances by: non-finite or negative is 0, at most 0.1 s. */
export function clampFrameDt(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(dt, MAX_FRAME_DT);
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

/** Where an actor is drawn in one frame. */
export interface MotionPose {
  /** World position of the piece origin (footprint centre at ground level, plus offsets). */
  x: number;
  y: number;
  z: number;
  /** Three.js `rotation.y` in radians. */
  yaw: number;
  /** Tilt about the world X and Z axes in radians (top leans toward the motion). */
  tiltX: number;
  tiltZ: number;
  /** Base height as a fraction of the lift height, 0 to 1; drives the shadow. */
  lift: number;
  /** Multiplies the material's own opacity. */
  opacity: number;
  /** Uniform model scale. */
  scale: number;
}

/** Rest pose for a type anchored on a tile: footprint centre and the rotation's yaw. */
export function restFor(type: PieceType, tile: Tile, rotation: Rotation): RestTransform {
  return pieceRestTransform({ type, gridX: tile.gridX, gridZ: tile.gridZ, rotation });
}

/** A lean below this (radians, about 0.006°) snaps to exactly 0 once the drag has stopped. */
export const TILT_SNAP = 1e-4;

type Horizontal =
  | { kind: 'fixed' }
  | { kind: 'follow'; tx: number; tz: number }
  | { kind: 'tween'; x: ClockTween; z: ClockTween };

type Base = { kind: 'tween'; tw: ClockTween } | { kind: 'drop'; start: number; from: number };

/**
 * Motion of one board piece or ghost: horizontal position (fixed, spring
 * follow or tween), base height (tween or drop curve), hover lift, yaw,
 * shake, tilt and opacity. Times are on the director clock (seconds).
 * `advance` must run once per frame before `sample`.
 */
export class PieceMotion {
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  tiltX = 0;
  tiltZ = 0;
  private h: Horizontal = { kind: 'fixed' };
  private base: Base = { kind: 'tween', tw: hold(0) };
  private hover: ClockTween;
  private hoverOn: boolean;
  private yaw: ClockTween;
  /** Cumulative Three.js yaw target in degrees (see `rotationTargetFor`). */
  private yawTarget: number;
  private shakeStart: number | null = null;
  private opacity: ClockTween = hold(1);
  private tiltRelease: { x: ClockTween; z: ClockTween } | null = null;

  constructor(rest: RestTransform, hoverLift = 0) {
    this.x = rest.x;
    this.z = rest.z;
    this.yawTarget = rest.yawDeg;
    this.yaw = hold(rest.yawDeg);
    this.hover = hold(hoverLift);
    this.hoverOn = hoverLift > 0;
  }

  /** True while the horizontal position follows the drag spring. */
  get following(): boolean {
    return this.h.kind === 'follow';
  }

  /** The cumulative yaw target in degrees. */
  get yawTargetDeg(): number {
    return this.yawTarget;
  }

  baseAt(now: number): number {
    const b = this.base;
    return b.kind === 'tween' ? sampleTween(b.tw, now) : dropHeight(now - b.start, b.from);
  }

  private hoverAt(now: number): number {
    return sampleTween(this.hover, now);
  }

  private stopHorizontal(): void {
    this.h = { kind: 'fixed' };
    this.vx = 0;
    this.vz = 0;
  }

  /** Leaves spring follow for a tween: no velocity, lean easing to 0 over `tiltDuration`. */
  private release(now: number, tiltDuration: number): void {
    if (this.h.kind === 'follow') this.releaseTilt(now, tiltDuration);
    this.vx = 0;
    this.vz = 0;
  }

  /** Grab: lift to 0.3 tiles over 120 ms (ease-out) and start following (Requirement 31.1). */
  grab(now: number): void {
    const y = this.baseAt(now) + this.hoverAt(now);
    this.base = { kind: 'tween', tw: clockTween(y, LIFT_HEIGHT, now, LIFT_DURATION, easeOutCubic) };
    this.hover = hold(0);
    this.hoverOn = false;
    this.shakeStart = null;
    this.tiltRelease = null;
    this.h = { kind: 'follow', tx: this.x, tz: this.z };
    this.vx = 0;
    this.vz = 0;
  }

  /** New follow target (the snapped tile's footprint centre). */
  setTarget(x: number, z: number): void {
    if (this.h.kind === 'follow') this.h = { kind: 'follow', tx: x, tz: z };
  }

  /** Jumps to a position with no velocity (a ghost's first tile). */
  placeAt(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    if (this.h.kind === 'follow') this.h = { kind: 'follow', tx: x, tz: z };
  }

  /** Eases the yaw to the angle of `rotation` nearest the current target. */
  private yawTo(now: number, rotation: Rotation, start: number, duration: number): void {
    const { target } = rotationTargetFor(this.yawTarget, rotation);
    if (target === this.yawTarget && tweenDone(this.yaw, now)) return;
    this.yaw = clockTween(sampleTween(this.yaw, now), target, start, duration, easeOutCubic);
    this.yawTarget = target;
  }

  /**
   * Rotation change. A single clockwise step turns over 150 ms when `animate`
   * is true (Requirement 31.7); any other change jumps (Requirement 31.11).
   */
  rotate(now: number, rotation: Rotation, animate: boolean): void {
    const r = rotationTargetFor(this.yawTarget, rotation);
    if (r.target === this.yawTarget) return;
    this.yaw =
      animate && r.animate
        ? clockTween(sampleTween(this.yaw, now), r.target, now, ROTATE_DURATION, easeOutCubic)
        : hold(r.target);
    this.yawTarget = r.target;
  }

  /** Valid drop: settle onto the rest pose with the fall and bounce (Requirement 31.4). */
  drop(now: number, rest: RestTransform, rotation: Rotation): void {
    this.release(now, DROP_FALL_DURATION);
    this.h = {
      kind: 'tween',
      x: clockTween(this.x, rest.x, now, DROP_FALL_DURATION, easeOutCubic),
      z: clockTween(this.z, rest.z, now, DROP_FALL_DURATION, easeOutCubic),
    };
    this.base = { kind: 'drop', start: now, from: this.baseAt(now) };
    this.shakeStart = null;
    this.yawTo(now, rotation, now, DROP_FALL_DURATION);
  }

  /**
   * Eases back to the rest pose (position, height and rotation) over
   * `RETURN_DURATION`, starting `delay` seconds from now.
   */
  returnTo(now: number, rest: RestTransform, rotation: Rotation, delay = 0): void {
    const start = now + delay;
    this.release(now, delay + RETURN_DURATION);
    this.h = {
      kind: 'tween',
      x: clockTween(this.x, rest.x, start, RETURN_DURATION, easeInOutCubic),
      z: clockTween(this.z, rest.z, start, RETURN_DURATION, easeInOutCubic),
    };
    this.base = { kind: 'tween', tw: clockTween(this.baseAt(now), 0, start, RETURN_DURATION, easeInOutCubic) };
    this.yawTo(now, rotation, start, RETURN_DURATION);
  }

  /** Starts the 200 ms invalid-drop shake and stops following. */
  shake(now: number): void {
    this.release(now, SHAKE_DURATION + RETURN_DURATION);
    this.stopHorizontal();
    this.shakeStart = now;
  }

  /** Invalid drop of a board piece: shake, then ease back (Requirement 31.5). */
  shakeAndReturn(now: number, rest: RestTransform, rotation: Rotation): void {
    this.shake(now);
    this.returnTo(now, rest, rotation, SHAKE_DURATION);
  }

  /** A move that is not a drag (test hook, redo): slide over 240 ms with the bounce only. */
  slideTo(now: number, rest: RestTransform): void {
    this.release(now, DROP_DURATION);
    this.h = {
      kind: 'tween',
      x: clockTween(this.x, rest.x, now, DROP_DURATION, easeOutCubic),
      z: clockTween(this.z, rest.z, now, DROP_DURATION, easeOutCubic),
    };
    this.base = { kind: 'drop', start: now - DROP_FALL_DURATION, from: 0 };
  }

  /** Jumps to the rest pose with no animation (undo, Requirement 31.11). */
  snapTo(rest: RestTransform, rotation: Rotation): void {
    this.stopHorizontal();
    this.x = rest.x;
    this.z = rest.z;
    this.base = { kind: 'tween', tw: hold(0) };
    this.shakeStart = null;
    this.tiltX = 0;
    this.tiltZ = 0;
    this.tiltRelease = null;
    const { target } = rotationTargetFor(this.yawTarget, rotation);
    this.yawTarget = target;
    this.yaw = hold(target);
  }

  /** Hover lift on or off: +0.05 tiles over 120 ms, ease-out (Requirement 31.9). */
  setHover(now: number, on: boolean): void {
    if (on === this.hoverOn) return;
    this.hoverOn = on;
    this.hover = clockTween(this.hoverAt(now), on ? HOVER_LIFT : 0, now, HOVER_DURATION, easeOutCubic);
  }

  /** Fades the opacity factor to 0 over `duration`, starting `delay` seconds from now. */
  fadeOut(now: number, delay: number, duration: number): void {
    this.opacity = clockTween(sampleTween(this.opacity, now), 0, now + delay, duration, easeOutCubic);
  }

  /** True once a fade-out has finished. */
  faded(now: number): boolean {
    return this.opacity.to === 0 && tweenDone(this.opacity, now);
  }

  /** Steps the spring, the tweened position and the tilt to clock time `now` (`dt` seconds later). */
  advance(now: number, dt: number): void {
    const h = this.h;
    if (h.kind === 'follow') {
      const r = springStepVec({ pos: [this.x, this.z], vel: [this.vx, this.vz] }, [h.tx, h.tz], DRAG_SPRING, dt);
      this.x = r.pos[0]!;
      this.z = r.pos[1]!;
      this.vx = r.vel[0]!;
      this.vz = r.vel[1]!;
    } else if (h.kind === 'tween') {
      this.x = sampleTween(h.x, now);
      this.z = sampleTween(h.z, now);
      if (tweenDone(h.x, now) && tweenDone(h.z, now)) this.h = { kind: 'fixed' };
    }
    if (h.kind === 'follow') {
      // Lean toward the velocity; once the spring has settled the target is 0
      // and the lean eases back, snapping to exactly 0 when it is negligible.
      const target = tiltRotation(this.vx, this.vz);
      this.tiltX = smoothTowards(this.tiltX, target.x, dt, TILT_EASE_TAU);
      this.tiltZ = smoothTowards(this.tiltZ, target.z, dt, TILT_EASE_TAU);
      if (target.x === 0 && target.z === 0 && Math.hypot(this.tiltX, this.tiltZ) < TILT_SNAP) {
        this.tiltX = 0;
        this.tiltZ = 0;
      }
    } else if (this.tiltRelease !== null) {
      // After a release the lean eases to exactly 0 by the time the piece lands.
      this.tiltX = sampleTween(this.tiltRelease.x, now);
      this.tiltZ = sampleTween(this.tiltRelease.z, now);
      if (tweenDone(this.tiltRelease.x, now)) this.tiltRelease = null;
    } else {
      this.tiltX = 0;
      this.tiltZ = 0;
    }
  }

  /** Eases the current lean to 0 over `duration` (seconds) from now. */
  private releaseTilt(now: number, duration: number): void {
    this.tiltRelease =
      this.tiltX === 0 && this.tiltZ === 0
        ? null
        : {
            x: clockTween(this.tiltX, 0, now, duration, easeOutCubic),
            z: clockTween(this.tiltZ, 0, now, duration, easeOutCubic),
          };
  }

  /** The pose at clock time `now`. */
  sample(now: number): MotionPose {
    const shake = this.shakeStart === null ? 0 : shakeOffset(now - this.shakeStart);
    const base = this.baseAt(now);
    return {
      x: this.x + shake,
      y: base + this.hoverAt(now),
      z: this.z,
      yaw: degToRad(sampleTween(this.yaw, now)),
      tiltX: this.tiltX,
      tiltZ: this.tiltZ,
      lift: Math.min(1, Math.max(0, base / LIFT_HEIGHT)),
      opacity: sampleTween(this.opacity, now),
      scale: 1,
    };
  }
}

/** The 200 ms exit copy of a deleted piece (Requirement 31.8). */
export class ExitMotion {
  readonly from: Pick<MotionPose, 'x' | 'y' | 'z' | 'yaw'>;
  readonly start: number;

  constructor(from: Pick<MotionPose, 'x' | 'y' | 'z' | 'yaw'>, start: number) {
    this.from = from;
    this.start = start;
  }

  sample(now: number): MotionPose {
    const f = deleteFrame(Math.max(0, now - this.start));
    return {
      x: this.from.x,
      y: this.from.y + f.rise,
      z: this.from.z,
      yaw: this.from.yaw,
      tiltX: 0,
      tiltZ: 0,
      lift: 0,
      opacity: f.opacity,
      scale: f.scale,
    };
  }

  done(now: number): boolean {
    return now - this.start >= DELETE_DURATION;
  }
}

// ---------------------------------------------------------------------------
// Contact shadow of an actor
// ---------------------------------------------------------------------------

/** A blob ellipse in piece-local space (`blobFootprint` in `instancing.ts`). */
export interface BlobShape {
  cx: number;
  cz: number;
  width: number;
  depth: number;
}

/** Where an actor's blob is drawn: ground position, yaw, size and opacity factor. */
export interface BlobPlacement {
  x: number;
  z: number;
  yaw: number;
  width: number;
  depth: number;
  /** Multiplies the resting blob opacity. */
  opacity: number;
}

/**
 * The blob under an actor. Lifted pieces get a shadow up to 1.4 times larger
 * and at 0.6 times the opacity, which reads as a softer edge (Requirement
 * 31.1); the factors follow the lift height, so the blob changes with it.
 */
export function blobPlacement(shape: BlobShape, pose: MotionPose): BlobPlacement {
  const grow = (1 + (GRAB_SHADOW_SCALE - 1) * pose.lift) * pose.scale;
  const soften = 1 + (GRAB_SHADOW_OPACITY - 1) * pose.lift;
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  return {
    x: pose.x + (shape.cx * cos + shape.cz * sin) * pose.scale,
    z: pose.z + (-shape.cx * sin + shape.cz * cos) * pose.scale,
    yaw: pose.yaw,
    width: shape.width * grow,
    depth: shape.depth * grow,
    opacity: soften * pose.opacity,
  };
}

// ---------------------------------------------------------------------------
// Selection outline
// ---------------------------------------------------------------------------

/** Outline thickness in world units (tiles). */
export const OUTLINE_THICKNESS = 0.025;

/**
 * Outline colour of a piece actor (Requirement 12.1): the `selectionOutline`
 * token while selected, and the ghost green or red while it is board-dragged
 * over a valid or invalid tile (D-49). Null for a piece that is not selected.
 */
export function outlineColourFor(
  s: { drag: DragState | null; selectedPieceId: string | null },
  pieceId: string,
): string | null {
  const drag = s.drag;
  if (drag !== null && drag.pieceId === pieceId) {
    return drag.tile !== null && drag.valid ? TOKENS.ghostValid.hex : TOKENS.ghostInvalid.hex;
  }
  return s.selectedPieceId === pieceId ? TOKENS.selectionOutline.hex : null;
}

// ---------------------------------------------------------------------------
// Store transitions
// ---------------------------------------------------------------------------

/** The store fields the director reads (`AppState` satisfies it). */
export interface ActiveSnapshot {
  screen: Screen;
  mode: 'build' | 'play';
  pieces: readonly Piece[];
  selectedPieceId: string | null;
  drag: DragState | null;
  hoverPieceId: string | null;
  history: History;
}

/**
 * True when `next` is `prev` after one undo. A new entry always empties the
 * redo stack and a redo shrinks it, so only an undo makes it grow by one.
 */
export function isUndoStep(prev: History, next: History): boolean {
  return prev !== next && next.future.length === prev.future.length + 1 && next.past.length === prev.past.length - 1;
}

/**
 * Id of the piece removed by a recorded `remove` entry between two
 * snapshots (Delete, the delete button, the test hook, or a redo of a
 * delete), or null. Undo, opening a diorama and other changes give null.
 */
export function removedByDelete(prev: ActiveSnapshot, next: ActiveSnapshot): string | null {
  if (prev.history === next.history || prev.pieces === next.pieces) return null;
  if (isUndoStep(prev.history, next.history)) return null;
  const top = next.history.past[next.history.past.length - 1];
  if (top === undefined || top.kind !== 'remove') return null;
  const id = top.piece.id;
  const wasThere = prev.pieces.some((p) => p.id === id);
  const isGone = !next.pieces.some((p) => p.id === id);
  return wasThere && isGone ? id : null;
}

/** How a released drag ended, decided once the store has settled. */
export type BoardDropOutcome = 'drop' | 'cancel' | 'invalid';
export type GhostDropOutcome = 'placed' | 'cancel' | 'invalid';

/**
 * A board drag ended. `piece` is the piece afterwards. It landed when it now
 * sits on the drag tile with the drag rotation (including a drop on its own
 * tile). Otherwise a drag over a valid tile was cancelled (Escape) and any
 * other release was an invalid drop (D-49).
 */
export function boardDropOutcome(drag: DragState, piece: Piece): BoardDropOutcome {
  const t = drag.tile;
  if (t !== null && piece.gridX === t.gridX && piece.gridZ === t.gridZ && piece.rotation === drag.rotation) return 'drop';
  return t !== null && drag.valid ? 'cancel' : 'invalid';
}

/**
 * A palette drag ended. It placed a piece when `pieces` holds a new piece of
 * the dragged type anchored on the drag tile. Otherwise it was cancelled
 * (over a valid tile) or invalid.
 */
export function ghostDropOutcome(
  drag: DragState,
  idsBefore: ReadonlySet<string>,
  pieces: readonly Piece[],
): GhostDropOutcome {
  const t = drag.tile;
  if (
    t !== null &&
    pieces.some((p) => !idsBefore.has(p.id) && p.type === drag.type && p.gridX === t.gridX && p.gridZ === t.gridZ)
  ) {
    return 'placed';
  }
  return t !== null && drag.valid ? 'cancel' : 'invalid';
}

function sameTile(a: Tile | null, b: Tile | null): boolean {
  if (a === null || b === null) return a === b;
  return a.gridX === b.gridX && a.gridZ === b.gridZ;
}

/** True when two drag states belong to the same gesture. */
function sameGesture(a: DragState, b: DragState): boolean {
  return a.source === b.source && a.type === b.type && a.pieceId === b.pieceId;
}

// ---------------------------------------------------------------------------
// Director
// ---------------------------------------------------------------------------

export type ActorKind = 'piece' | 'ghost' | 'exit';

/** What React needs to mount an actor: its key, kind and model type. */
export interface ActorInfo {
  readonly key: string;
  readonly kind: ActorKind;
  readonly type: PieceType;
  /** The piece id for `piece` and `exit` actors; null for ghosts. */
  readonly pieceId: string | null;
}

/** An actor's pose plus how to draw it in this frame. */
export interface ActorFrame extends MotionPose {
  /** False for a ghost that has not reached the grid yet. */
  visible: boolean;
  /** Ghost tint: green when true, red when false. */
  valid: boolean;
}

interface PieceActor {
  info: ActorInfo;
  kind: 'piece';
  motion: PieceMotion;
  dragging: boolean;
  /** A released board drag waiting for the store to settle. */
  pending: DragState | null;
}

interface GhostActor {
  info: ActorInfo;
  kind: 'ghost';
  motion: PieceMotion | null;
  /** True while this ghost belongs to the current palette drag. */
  live: boolean;
  /** Tint after release. */
  validAtRelease: boolean;
  pending: { drag: DragState; idsBefore: ReadonlySet<string> } | null;
}

interface ExitActor {
  info: ActorInfo;
  kind: 'exit';
  motion: ExitMotion;
}

type Actor = PieceActor | GhostActor | ExitActor;

export const pieceActorKey = (id: string): string => `piece:${id}`;

/**
 * Turns store transitions into actor motions. Call `update` with every new
 * store state (synchronously, from a store subscription) and `advance` once
 * per frame; then read `actors()` and `frame(key)`.
 */
export class ActivePieceDirector {
  private snap: ActiveSnapshot;
  private clock = 0;
  private readonly table = new Map<string, Actor>();
  private list: readonly ActorInfo[] | null = null;
  private ghostSeq = 0;
  private exitSeq = 0;

  constructor(initial: ActiveSnapshot) {
    this.snap = initial;
    this.reconcilePieces(initial, new Set());
    if (initial.drag !== null && this.building(initial)) this.startDrag(initial.drag);
  }

  /** Seconds since the director was created (sum of clamped frame times). */
  get now(): number {
    return this.clock;
  }

  /** The latest snapshot passed to `update`. */
  get snapshot(): ActiveSnapshot {
    return this.snap;
  }

  /** The current actors in creation order. Same array until the set changes. */
  actors(): readonly ActorInfo[] {
    if (this.list === null) this.list = Object.freeze([...this.table.values()].map((a) => a.info));
    return this.list;
  }

  private building(s: ActiveSnapshot): boolean {
    return s.screen === 'playfield' && s.mode === 'build';
  }

  private add(actor: Actor): void {
    this.table.set(actor.info.key, actor);
    this.list = null;
  }

  private remove(key: string): void {
    if (this.table.delete(key)) this.list = null;
  }

  private pieceActor(id: string): PieceActor | null {
    const a = this.table.get(pieceActorKey(id));
    return a !== undefined && a.kind === 'piece' ? a : null;
  }

  private liveGhost(): GhostActor | null {
    for (const a of this.table.values()) if (a.kind === 'ghost' && a.live) return a;
    return null;
  }

  /** Applies one store transition. */
  update(next: ActiveSnapshot): void {
    const prev = this.snap;
    if (prev === next) return;
    this.snap = next;
    const now = this.clock;
    const building = this.building(next);

    // 1. Exit copy of a deleted piece, from where it is drawn now.
    const deleted = building ? removedByDelete(prev, next) : null;
    if (deleted !== null) {
      const old = prev.pieces.find((p) => p.id === deleted)!;
      const actor = this.pieceActor(deleted);
      const from = actor
        ? actor.motion.sample(now)
        : { ...pieceRestTransform(old), y: 0 };
      this.exitSeq += 1;
      this.add({
        info: { key: `exit:${deleted}:${this.exitSeq}`, kind: 'exit', type: old.type, pieceId: deleted },
        kind: 'exit',
        motion: new ExitMotion({ x: from.x, y: from.y, z: from.z, yaw: from.yaw }, now),
      });
    }

    // 2. A drag ended (drop, Escape, Play mode, blur).
    const pd = prev.drag;
    const nd = next.drag;
    const ended = pd !== null && (nd === null || !sameGesture(pd, nd));
    if (ended) this.endDrag(pd, prev.pieces);

    // 3. Active piece actors follow `isActivePiece`.
    const created = new Set<string>();
    this.reconcilePieces(next, created, prev);

    // 4. Drag start or drag update.
    if (nd !== null && building) {
      if (pd === null || ended) this.startDrag(nd);
      else this.updateDrag(pd, nd);
    }

    // 5. Changes to idle active pieces (R, test hook, undo, redo).
    const undo = isUndoStep(prev.history, next.history);
    if (prev.pieces !== next.pieces) {
      for (const a of this.table.values()) {
        if (a.kind !== 'piece' || a.dragging || a.pending !== null || created.has(a.info.pieceId!)) continue;
        const before = prev.pieces.find((p) => p.id === a.info.pieceId);
        const after = next.pieces.find((p) => p.id === a.info.pieceId);
        if (!before || !after) continue;
        const moved = before.gridX !== after.gridX || before.gridZ !== after.gridZ;
        const turned = before.rotation !== after.rotation;
        if (!moved && !turned) continue;
        if (undo) {
          a.motion.snapTo(pieceRestTransform(after), after.rotation);
          continue;
        }
        if (moved) a.motion.slideTo(now, pieceRestTransform(after));
        if (turned) a.motion.rotate(now, after.rotation, true);
      }
    }

    // 6. Hover lift of the selected piece.
    for (const a of this.table.values()) {
      if (a.kind !== 'piece') continue;
      const hovered = !a.dragging && a.pending === null && isHoverLifted(a.info.pieceId!, next);
      a.motion.setHover(now, hovered);
    }

    // 7. Outside Build mode nothing transient stays on screen.
    if (!building) {
      for (const a of [...this.table.values()]) if (a.kind !== 'piece') this.remove(a.info.key);
    }
  }

  private reconcilePieces(next: ActiveSnapshot, created: Set<string>, prev?: ActiveSnapshot): void {
    const ids = this.building(next) ? activePieceIds(next.pieces, next) : [];
    const keep = new Set(ids);
    for (const a of [...this.table.values()]) {
      if (a.kind === 'piece' && !keep.has(a.info.pieceId!)) this.remove(a.info.key);
    }
    for (const id of ids) {
      if (this.pieceActor(id)) continue;
      const piece = next.pieces.find((p) => p.id === id)!;
      // A piece the pointer was already lifting in `PieceLayer` keeps its hover lift.
      const hovered = prev !== undefined && isHoverLifted(id, prev);
      this.add({
        info: { key: pieceActorKey(id), kind: 'piece', type: piece.type, pieceId: id },
        kind: 'piece',
        motion: new PieceMotion(pieceRestTransform(piece), hovered ? HOVER_LIFT : 0),
        dragging: false,
        pending: null,
      });
      created.add(id);
    }
  }

  private startDrag(drag: DragState): void {
    const now = this.clock;
    if (drag.source === 'board') {
      const a = drag.pieceId === null ? null : this.pieceActor(drag.pieceId);
      if (!a) return;
      a.dragging = true;
      a.pending = null;
      a.motion.grab(now);
      a.motion.rotate(now, drag.rotation, true);
      if (drag.tile !== null) {
        const t = restFor(drag.type, drag.tile, drag.rotation);
        a.motion.setTarget(t.x, t.z);
      }
      return;
    }
    this.ghostSeq += 1;
    const ghost: GhostActor = {
      info: { key: `ghost:${this.ghostSeq}`, kind: 'ghost', type: drag.type, pieceId: null },
      kind: 'ghost',
      motion: null,
      live: true,
      validAtRelease: false,
      pending: null,
    };
    this.add(ghost);
    if (drag.tile !== null) this.showGhost(ghost, drag);
  }

  /** Puts a ghost on its first tile and starts the lift. */
  private showGhost(ghost: GhostActor, drag: DragState): void {
    const rest = restFor(drag.type, drag.tile!, drag.rotation);
    ghost.motion = new PieceMotion(rest);
    ghost.motion.grab(this.clock);
  }

  private updateDrag(prev: DragState, next: DragState): void {
    const now = this.clock;
    let motion: PieceMotion | null = null;
    if (next.source === 'board') {
      motion = next.pieceId === null ? null : (this.pieceActor(next.pieceId)?.motion ?? null);
    } else {
      const ghost = this.liveGhost();
      if (ghost === null) return;
      if (ghost.motion === null) {
        // Off the grid until now: the ghost appears on the first tile.
        if (next.tile !== null) this.showGhost(ghost, next);
        return;
      }
      motion = ghost.motion;
    }
    if (motion === null) return;
    if (next.rotation !== prev.rotation) motion.rotate(now, next.rotation, true);
    // Off the grid the object waits at the last tile (D-49).
    if (next.tile !== null && (!sameTile(prev.tile, next.tile) || next.rotation !== prev.rotation)) {
      const t = restFor(next.type, next.tile, next.rotation);
      motion.setTarget(t.x, t.z);
    }
  }

  private endDrag(drag: DragState, piecesBefore: readonly Piece[]): void {
    if (drag.source === 'board') {
      const a = drag.pieceId === null ? null : this.pieceActor(drag.pieceId);
      if (!a) return;
      a.dragging = false;
      a.pending = drag;
      return;
    }
    const ghost = this.liveGhost();
    if (!ghost) return;
    ghost.live = false;
    ghost.validAtRelease = drag.tile !== null && drag.valid;
    ghost.pending = { drag, idsBefore: new Set(piecesBefore.map((p) => p.id)) };
  }

  /** Advances the clock by one frame, settles released drags and steps every motion. */
  advance(dt: number): void {
    const d = clampFrameDt(dt);
    this.clock += d;
    const now = this.clock;
    const pieces = this.snap.pieces;

    for (const a of [...this.table.values()]) {
      if (a.kind === 'piece') {
        if (a.pending !== null) {
          const drag = a.pending;
          a.pending = null;
          const piece = pieces.find((p) => p.id === a.info.pieceId);
          if (piece) {
            const rest = pieceRestTransform(piece);
            const outcome = boardDropOutcome(drag, piece);
            if (outcome === 'drop') a.motion.drop(now, rest, piece.rotation);
            else if (outcome === 'cancel') a.motion.returnTo(now, rest, piece.rotation);
            else a.motion.shakeAndReturn(now, rest, piece.rotation);
          }
        }
        // The release changes no store field the hover rule reads, so re-check it here.
        a.motion.setHover(now, !a.dragging && isHoverLifted(a.info.pieceId!, this.snap));
        a.motion.advance(now, d);
      } else if (a.kind === 'ghost') {
        if (a.pending !== null) {
          const { drag, idsBefore } = a.pending;
          a.pending = null;
          const outcome = ghostDropOutcome(drag, idsBefore, pieces);
          if (a.motion === null || outcome === 'placed') {
            this.remove(a.info.key);
            continue;
          }
          if (outcome === 'cancel') {
            a.motion.fadeOut(now, 0, RETURN_DURATION);
          } else {
            a.motion.shake(now);
            a.motion.fadeOut(now, SHAKE_DURATION, RETURN_DURATION);
          }
        }
        if (a.motion === null) continue;
        a.motion.advance(now, d);
        if (!a.live && a.pending === null && a.motion.faded(now)) this.remove(a.info.key);
      } else if (a.motion.done(now)) {
        this.remove(a.info.key);
      }
    }
  }

  /** The actor's pose and tint for this frame, or null for an unknown key. */
  frame(key: string): ActorFrame | null {
    const a = this.table.get(key);
    if (a === undefined) return null;
    const now = this.clock;
    if (a.kind === 'exit') return { ...a.motion.sample(now), visible: true, valid: true };
    if (a.kind === 'ghost') {
      if (a.motion === null) return { ...HIDDEN_POSE, visible: false, valid: false };
      const drag = this.snap.drag;
      const valid = a.live ? drag !== null && drag.tile !== null && drag.valid : a.validAtRelease;
      return { ...a.motion.sample(now), visible: true, valid };
    }
    const drag = this.snap.drag;
    const valid = !a.dragging || (drag !== null && drag.tile !== null && drag.valid);
    return { ...a.motion.sample(now), visible: true, valid };
  }
}

const HIDDEN_POSE: MotionPose = { x: 0, y: 0, z: 0, yaw: 0, tiltX: 0, tiltZ: 0, lift: 0, opacity: 0, scale: 1 };
