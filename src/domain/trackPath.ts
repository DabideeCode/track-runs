/**
 * Track centrelines (design.md §1.8, Requirements 19.8, 19.9, 28.6, 28.19).
 *
 * Local coordinates have their origin at the tile centre, +x east and +z
 * south. The arc-length parameter `s` runs from 0 to the piece's length L.
 * s = 0 is the midpoint of the edge of connector index 0 in `catalogue.ts`,
 * and s = L is the midpoint of the edge of connector index 1 (for the buffer
 * stop, s = L is the face of the stop block, which is not a connector).
 * `progress` in the test hook is s / L.
 *
 * Centrelines at rotation 0°:
 *
 * | Type                          | From (s = 0)      | To (s = L)          | L     |
 * | ----------------------------- | ----------------- | ------------------- | ----- |
 * | straight, tunnel, station     | N midpoint (0, −0.5) | S midpoint (0, 0.5) | 1     |
 * | curve (centre (0.5, 0.5), r 0.5) | S midpoint (0, 0.5)  | E midpoint (0.5, 0) | π / 4 |
 * | buffer                        | S midpoint (0, 0.5)  | stop face (0, −0.25) | 0.75  |
 *
 * A clockwise rotation by 90° (viewed from above) maps (x, z) to (−z, x),
 * which turns N into E as `rotateDir` does.
 */
import { isTrackType } from './catalogue';
import { footprintCentre } from './grid';
import type { Piece, PieceType, Rotation, TrackType } from './types';

/** A 2D vector on the ground plane (x east, z south). */
export interface Vec2 {
  x: number;
  z: number;
}

/** The fields of a piece the geometry needs. */
export type TrackPieceLike = Pick<Piece, 'type' | 'gridX' | 'gridZ' | 'rotation'>;

/** Curve radius in tiles. */
export const CURVE_RADIUS = 0.5;

/** Distance from the buffer tile centre to the stop block face (the block fills the north 0.25). */
export const BUFFER_STOP_FACE = -0.25;

const LENGTHS: Readonly<Record<TrackType, number>> = Object.freeze({
  straight: 1,
  tunnel: 1,
  station: 1,
  curve: (Math.PI * CURVE_RADIUS) / 2, // quarter circle = π / 4
  buffer: 0.5 - BUFFER_STOP_FACE, // 0.75
});

function assertTrack(type: PieceType): TrackType {
  if (!isTrackType(type)) throw new Error(`Not a track type: ${String(type)}`);
  return type;
}

/** Centreline length L of a track type, in tiles. */
export function pathLength(type: TrackType): number {
  return LENGTHS[type];
}

/** Clamps s to [0, L]; NaN becomes 0. */
export function clampS(type: TrackType, s: number): number {
  if (Number.isNaN(s) || s <= 0) return 0;
  const L = LENGTHS[type];
  return s >= L ? L : s;
}

// ---------------------------------------------------------------------------
// Local (rotation 0°) geometry
// ---------------------------------------------------------------------------

/** Point on the 0° centreline at arc length s (clamped), relative to the tile centre. */
export function localPointAt(type: TrackType, s: number): Vec2 {
  const t = clampS(type, s);
  switch (type) {
    case 'straight':
    case 'tunnel':
    case 'station':
      return { x: 0, z: -0.5 + t };
    case 'buffer':
      return { x: 0, z: 0.5 - t };
    case 'curve': {
      // Exact endpoints avoid floating-point noise where pieces join.
      if (t === 0) return { x: 0, z: 0.5 };
      if (t === LENGTHS.curve) return { x: 0.5, z: 0 };
      // Angle measured from +x toward +z about the SE corner: π at the S midpoint, 3π/2 at the E midpoint.
      const theta = Math.PI + t / CURVE_RADIUS;
      return {
        x: 0.5 + CURVE_RADIUS * Math.cos(theta),
        z: 0.5 + CURVE_RADIUS * Math.sin(theta),
      };
    }
  }
}

/** Unit tangent of the 0° centreline at arc length s (clamped), pointing toward increasing s. */
export function localTangentAt(type: TrackType, s: number): Vec2 {
  const t = clampS(type, s);
  switch (type) {
    case 'straight':
    case 'tunnel':
    case 'station':
      return { x: 0, z: 1 };
    case 'buffer':
      return { x: 0, z: -1 };
    case 'curve': {
      if (t === 0) return { x: 0, z: -1 };
      if (t === LENGTHS.curve) return { x: 1, z: 0 };
      const theta = Math.PI + t / CURVE_RADIUS;
      return { x: -Math.sin(theta), z: Math.cos(theta) };
    }
  }
}

// ---------------------------------------------------------------------------
// Local → world transform
// ---------------------------------------------------------------------------

/** Turns a local vector clockwise (viewed from above) by a rotation; exact for all four values. */
export function rotateVec(v: Vec2, rotation: Rotation): Vec2 {
  // `+ 0` turns −0 into 0, so exact comparisons of endpoints behave.
  switch (rotation) {
    case 0:
      return { x: v.x + 0, z: v.z + 0 };
    case 90:
      return { x: -v.z + 0, z: v.x + 0 };
    case 180:
      return { x: -v.x + 0, z: -v.z + 0 };
    case 270:
      return { x: v.z + 0, z: -v.x + 0 };
  }
}

/** Maps a local point of a piece to world coordinates (rotation, then footprint-centre offset). */
export function localToWorld(piece: TrackPieceLike, local: Vec2): Vec2 {
  const r = rotateVec(local, piece.rotation);
  const c = footprintCentre(piece.type, piece.gridX, piece.gridZ);
  return { x: c.x + r.x, z: c.z + r.z };
}

/** Three.js `rotation.y` (radians) for a piece rotation: −rotation × π / 180. */
export function rotationToYaw(rotation: Rotation): number {
  return -(rotation * Math.PI) / 180;
}

// ---------------------------------------------------------------------------
// World geometry
// ---------------------------------------------------------------------------

/** World point on a track piece's centreline at arc length s, clamped to [0, L]. */
export function pointAt(piece: TrackPieceLike, s: number): Vec2 {
  const type = assertTrack(piece.type);
  return localToWorld(piece, localPointAt(type, s));
}

/** World unit tangent at arc length s (clamped), pointing toward increasing s. */
export function tangentAt(piece: TrackPieceLike, s: number): Vec2 {
  const type = assertTrack(piece.type);
  return rotateVec(localTangentAt(type, s), piece.rotation);
}

/** World point at end 0 (s = 0) or end 1 (s = L) of a track piece. */
export function endPoint(piece: TrackPieceLike, end: 0 | 1): Vec2 {
  const type = assertTrack(piece.type);
  return pointAt(piece, end === 0 ? 0 : LENGTHS[type]);
}

/**
 * World unit vector pointing out of the piece at an end: −tangent at s = 0,
 * +tangent at s = L. At a connector end it points across the connector edge,
 * which is the direction a straight extension beyond an open end follows.
 */
export function endOutward(piece: TrackPieceLike, end: 0 | 1): Vec2 {
  const type = assertTrack(piece.type);
  const t = tangentAt(piece, end === 0 ? 0 : LENGTHS[type]);
  return end === 0 ? { x: -t.x + 0, z: -t.z + 0 } : t;
}
