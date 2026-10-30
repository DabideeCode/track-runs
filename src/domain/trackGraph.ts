/**
 * Track graph and walking along it (design.md §1.9, Requirements 19.3, 19.10, 20.5).
 *
 * Every track piece is a node with two ends: end 0 at s = 0 (connector index
 * 0) and end 1 at s = L (connector index 1). `links[k]` is the neighbour
 * joined through connector k, with the neighbour end it enters. A buffer's
 * end 1 is the stop block and is always `null`. Decorations are not nodes.
 *
 * Walking semantics (shared by `advance`, `distanceToDeadEnd`, `walkPose`):
 *
 * - `TrackLoc.heading` is the way the thing at the location faces, in terms
 *   of s: +1 faces toward increasing s, −1 toward decreasing s.
 * - A positive distance walks along `heading` (forward); a negative distance
 *   walks against it (backward, e.g. from the locomotive back to a carriage).
 * - On reaching an end the walk follows the link: entering a neighbour through
 *   its end 0 continues at s = 0 travelling toward +s; through its end 1 at
 *   s = L travelling toward −s. A `null` link is a dead end.
 * - Returned locations keep the caller's facing semantics: after a backward
 *   walk the returned `heading` still points the way the original facing
 *   points once carried across the joints (opposite the walking direction).
 * - When the distance left is within 1e-9 of a piece end, the walk snaps to
 *   that end. `s` is always within [0, L].
 */
import { isTrackType } from './catalogue';
import { neighbourAcross } from './connections';
import { connectorsOf } from './connectors';
import { buildOccupancy } from './occupancy';
import { endOutward, endPoint, pathLength, pointAt, tangentAt, type Vec2 } from './trackPath';
import type { Piece } from './types';

/** One end of a track piece: end 0 is s = 0, end 1 is s = L. */
export interface EndLink {
  pieceId: string;
  end: 0 | 1;
}

export interface GraphNode {
  piece: Piece;
  length: number;
  /** links[k]: the neighbour end joined through connector k, or null for an open end or the stop block. */
  links: [EndLink | null, EndLink | null];
}

export interface TrackGraph {
  nodes: Map<string, GraphNode>;
}

/** A position on the track. heading is the facing direction in s (+1 toward s = L, −1 toward s = 0). */
export interface TrackLoc {
  pieceId: string;
  s: number;
  heading: 1 | -1;
}

export interface AdvanceResult {
  loc: TrackLoc;
  /** Distance actually walked, always ≥ 0 and ≤ |dist|. */
  moved: number;
  /** True when a dead end stopped the walk before |dist| was covered. */
  blocked: boolean;
}

export interface WalkPose {
  x: number;
  z: number;
  /** Unit vector in the facing direction of the original heading (the vehicle's forward direction). */
  tangent: Vec2;
  /** False when the point lies on the straight extension past a dead end. */
  onTrack: boolean;
  /** The piece under the point, or null on the extension. */
  pieceId: string | null;
}

/** Distances within this of a piece end snap to the end. */
const SNAP_EPS = 1e-9;

/** Build the graph of all track pieces. Assumes unique ids (a store invariant). */
export function buildTrackGraph(pieces: readonly Piece[]): TrackGraph {
  const index = buildOccupancy(pieces);
  const nodes = new Map<string, GraphNode>();
  for (const piece of pieces) {
    if (!isTrackType(piece.type)) continue;
    const links: [EndLink | null, EndLink | null] = [null, null];
    connectorsOf(piece).forEach((dir, k) => {
      if (k > 1) return;
      const hit = neighbourAcross(index, piece, dir);
      if (hit) links[k] = { pieceId: hit.piece.id, end: hit.connectorIndex === 0 ? 0 : 1 };
    });
    nodes.set(piece.id, { piece, length: pathLength(piece.type), links });
  }
  return { nodes };
}

function nodeOf(g: TrackGraph, pieceId: string): GraphNode {
  const node = g.nodes.get(pieceId);
  if (!node) throw new Error(`Not a track piece in the graph: ${pieceId}`);
  return node;
}

function clampToNode(node: GraphNode, s: number): number {
  if (Number.isNaN(s) || s <= 0) return 0;
  return s >= node.length ? node.length : s;
}

/** Internal walk state: `dir` is the direction of travel in s. */
interface WalkState {
  pieceId: string;
  s: number;
  dir: 1 | -1;
  moved: number;
  blocked: boolean;
  /** The end the walk stopped at when blocked. */
  deadEnd: 0 | 1 | null;
}

/**
 * Walk `d` (≥ 0, finite) from (pieceId, s) travelling `dir` in s. Each loop
 * iteration either finishes or consumes the rest of a piece, and every piece
 * after the first is entered at an end, so the loop runs at most
 * 2 + d / (shortest length) times, including on closed loops.
 */
function walk(g: TrackGraph, pieceId: string, s0: number, dir0: 1 | -1, d0: number): WalkState {
  let node = nodeOf(g, pieceId);
  let s = clampToNode(node, s0);
  let dir = dir0;
  let d = d0;
  let moved = 0;
  for (;;) {
    const L = node.length;
    const room = dir === 1 ? L - s : s;
    if (d <= room + SNAP_EPS) {
      if (d >= room - SNAP_EPS) s = dir === 1 ? L : 0;
      else s += dir * d;
      return { pieceId: node.piece.id, s, dir, moved: moved + d, blocked: false, deadEnd: null };
    }
    d -= room;
    moved += room;
    const end: 0 | 1 = dir === 1 ? 1 : 0;
    const link = node.links[end];
    if (!link) {
      return { pieceId: node.piece.id, s: dir === 1 ? L : 0, dir, moved, blocked: true, deadEnd: end };
    }
    node = nodeOf(g, link.pieceId);
    if (link.end === 0) {
      s = 0;
      dir = 1;
    } else {
      s = node.length;
      dir = -1;
    }
  }
}

/**
 * Distance along `heading` from loc to the first dead end (an open end or a
 * buffer's stop block), or Infinity if there is none within `max`. A closed
 * loop returns Infinity for any `max`, including Infinity.
 */
export function distanceToDeadEnd(g: TrackGraph, loc: TrackLoc, max: number): number {
  let node = nodeOf(g, loc.pieceId);
  let s = clampToNode(node, loc.s);
  let dir = loc.heading;
  let total = 0;
  // A walk with no dead end must revisit some (piece, direction) after at
  // most 2 × nodes crossings, so this bound detects closed loops.
  const maxCrossings = 2 * g.nodes.size + 1;
  for (let crossings = 0; crossings <= maxCrossings; crossings++) {
    total += dir === 1 ? node.length - s : s;
    if (total > max) return Infinity;
    const end: 0 | 1 = dir === 1 ? 1 : 0;
    const link = node.links[end];
    if (!link) return total;
    node = nodeOf(g, link.pieceId);
    if (link.end === 0) {
      s = 0;
      dir = 1;
    } else {
      s = node.length;
      dir = -1;
    }
  }
  return Infinity;
}

/**
 * Move `dist` along the track: forward along `heading` when positive,
 * backward when negative. Stops exactly at a dead end with `blocked: true`.
 * NaN counts as 0. An infinite distance walks to the dead end in that
 * direction, or leaves the location unchanged on a closed loop.
 */
export function advance(g: TrackGraph, loc: TrackLoc, dist: number): AdvanceResult {
  const node = nodeOf(g, loc.pieceId);
  let d = Number.isNaN(dist) ? 0 : dist;
  const backward = d < 0;
  const walkDir: 1 | -1 = backward ? (loc.heading === 1 ? -1 : 1) : loc.heading;
  d = Math.abs(d);
  if (d === Infinity) {
    const toEnd = distanceToDeadEnd(g, { pieceId: loc.pieceId, s: loc.s, heading: walkDir }, Infinity);
    if (toEnd === Infinity) {
      return { loc: { pieceId: loc.pieceId, s: clampToNode(node, loc.s), heading: loc.heading }, moved: 0, blocked: false };
    }
    const r = walk(g, loc.pieceId, loc.s, walkDir, toEnd);
    return { loc: facingLoc(r, backward), moved: r.moved, blocked: true };
  }
  const r = walk(g, loc.pieceId, loc.s, walkDir, d);
  return { loc: facingLoc(r, backward), moved: r.moved, blocked: r.blocked };
}

function facingLoc(r: WalkState, backward: boolean): TrackLoc {
  const heading: 1 | -1 = backward ? (r.dir === 1 ? -1 : 1) : r.dir;
  return { pieceId: r.pieceId, s: r.s, heading };
}

/**
 * World pose `dist` along the track from loc (positive along `heading`,
 * negative against it). Past a dead end the point continues on a straight
 * extension along the end's outward direction, with `onTrack: false` and
 * `pieceId: null` (Requirement 19.10). The tangent always points the way the
 * original heading faces, so a vehicle placed behind the locomotive with a
 * negative distance still faces forward. A non-finite distance counts as 0.
 */
export function walkPose(g: TrackGraph, loc: TrackLoc, dist: number): WalkPose {
  const d = Number.isFinite(dist) ? dist : 0;
  const backward = d < 0;
  const walkDir: 1 | -1 = backward ? (loc.heading === 1 ? -1 : 1) : loc.heading;
  const r = walk(g, loc.pieceId, loc.s, walkDir, Math.abs(d));
  const piece = nodeOf(g, r.pieceId).piece;
  const facing = backward ? -1 : 1;

  if (r.blocked && r.deadEnd !== null) {
    const extra = Math.abs(d) - r.moved;
    const p = endPoint(piece, r.deadEnd);
    const out = endOutward(piece, r.deadEnd);
    return {
      x: p.x + out.x * extra,
      z: p.z + out.z * extra,
      tangent: { x: facing * out.x + 0, z: facing * out.z + 0 },
      onTrack: false,
      pieceId: null,
    };
  }

  const p = pointAt(piece, r.s);
  const t = tangentAt(piece, r.s);
  // t points toward +s; the walking direction is r.dir; facing flips it for backward walks.
  const k = r.dir * facing;
  return { x: p.x, z: p.z, tangent: { x: k * t.x + 0, z: k * t.z + 0 }, onTrack: true, pieceId: r.pieceId };
}
