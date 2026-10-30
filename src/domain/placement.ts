/**
 * Placement engine (Requirements 11, 12, 14, 15, 16, 39 and 41; design §1.3).
 *
 * `applyBuild` validates and applies one place, move, rotate or remove request
 * against an immutable `pieces` array. The UI, the keyboard and the test hook
 * all go through it, so they share the same rules and reason codes (16.7).
 *
 * Validation order, first match wins (Requirement 16.12, Assumption 1):
 *
 * 1. `play_mode`     the context is in Play mode.
 * 2. `not_found`     move, rotate or remove id matches no piece; place with an
 *                    unknown type; place or move with a rotation that is
 *                    present but not 0, 90, 180 or 270.
 * 3. `out_of_bounds` gridX or gridZ is not an integer, or any footprint tile
 *                    lies outside 0 to 15.
 * 4. `station_limit` place of a station while one exists (moves are exempt).
 * 5. `on_track`      a decoration's footprint covers a track tile.
 * 6. `occupied`      any footprint tile holds another piece.
 *
 * Rules 5 and 6 ignore the piece being moved, so its own tiles count as free
 * (16.10). Rotate and remove can only fail with rules 1 and 2 (Assumption 6).
 *
 * Inputs typed `unknown` come straight from the test hook. Nothing here throws
 * on bad input; every bad value maps to a reason. `ctx.pieces` is never
 * mutated, and every returned array holds fresh piece copies.
 */
import { resolveAutoRotation } from './autoAdjust';
import { isPieceType, isRotation, isTrackType } from './catalogue';
import { newConnections } from './connections';
import { nextRotation } from './connectors';
import { footprintTiles, inGrid } from './grid';
import type { HistoryEntry } from './history';
import { buildOccupancy, pieceAt } from './occupancy';
import type { Piece, PieceType, Reason, Rotation } from './types';

export type { Reason } from './types';

export type BuildRequest =
  | {
      kind: 'place';
      type: unknown;
      gridX: unknown;
      gridZ: unknown;
      /** Absent (or undefined) means 0°. */
      rotation?: unknown;
      /** Apply the auto-adjust rule (Requirement 15) to the starting rotation. */
      autoAdjust: boolean;
    }
  | {
      kind: 'move';
      id: unknown;
      gridX: unknown;
      gridZ: unknown;
      /** Rotation shown at release for UI drags; absent keeps the piece's rotation. */
      rotation?: unknown;
    }
  | { kind: 'rotate'; id: unknown }
  | { kind: 'remove'; id: unknown };

export interface BuildContext {
  pieces: readonly Piece[];
  mode: 'build' | 'play';
  newId: () => string;
}

export type BuildSound = 'place' | 'move' | 'rotate' | 'delete';

export type BuildOutcome =
  | {
      ok: true;
      pieces: Piece[];
      /** Null for a move onto the same tile with the same rotation (Assumption 7). */
      entry: HistoryEntry | null;
      /** The new piece's id, set for place only. */
      id?: string;
      sound: BuildSound;
      /** True when the action created a connection that did not exist before. */
      snap: boolean;
    }
  | { ok: false; reason: Reason };

export interface FootprintOptions {
  /** Id of the piece being moved; its own tiles count as free. */
  movingId?: string;
  /** True for a new placement, which is subject to the station limit. Defaults to `movingId === undefined`. */
  isNew?: boolean;
}

function copyPiece(p: Piece): Piece {
  return { id: p.id, type: p.type, gridX: p.gridX, gridZ: p.gridZ, rotation: p.rotation };
}

function reject(reason: Reason): BuildOutcome {
  return { ok: false, reason };
}

/** Integer check that also normalises −0 to 0, so stored coordinates are clean. */
function asInteger(x: unknown): number | null {
  return typeof x === 'number' && Number.isInteger(x) ? x + 0 : null;
}

function findIndex(pieces: readonly Piece[], id: unknown): number {
  if (typeof id !== 'string') return -1;
  return pieces.findIndex((p) => p.id === id);
}

/**
 * Rules 3 to 6 for a footprint, or null when the footprint is valid. Used for
 * the ghost tint and drop validity as well as by `applyBuild`, so the preview
 * always agrees with the result (Requirements 11.5, 11.6).
 */
export function checkFootprint(
  pieces: readonly Piece[],
  type: PieceType,
  gridX: number,
  gridZ: number,
  opts: FootprintOptions = {},
): Reason | null {
  if (!isPieceType(type)) return 'not_found';
  if (!Number.isInteger(gridX) || !Number.isInteger(gridZ)) return 'out_of_bounds';
  const tiles = footprintTiles(type, gridX, gridZ);
  if (!tiles.every(inGrid)) return 'out_of_bounds';

  const { movingId } = opts;
  const isNew = opts.isNew ?? movingId === undefined;
  if (isNew && type === 'station' && pieces.some((p) => p.type === 'station' && p.id !== movingId)) {
    return 'station_limit';
  }

  const index = buildOccupancy(pieces);
  const others = tiles
    .map((t) => pieceAt(index, t))
    .filter((p): p is Piece => p !== undefined && p.id !== movingId);
  if (!isTrackType(type) && others.some((p) => isTrackType(p.type))) return 'on_track';
  if (others.length > 0) return 'occupied';
  return null;
}

/** A fresh id from `newId` that no existing piece uses. */
function uniqueId(pieces: readonly Piece[], newId: () => string): string {
  const taken = new Set(pieces.map((p) => p.id));
  let id = String(newId());
  for (let attempt = 0; attempt < 16 && (id === '' || taken.has(id)); attempt++) {
    id = String(newId());
  }
  if (id === '' || taken.has(id)) {
    const base = id === '' ? 'piece' : id;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    id = `${base}-${n}`;
  }
  return id;
}

function place(ctx: BuildContext, req: Extract<BuildRequest, { kind: 'place' }>): BuildOutcome {
  const { type } = req;
  if (!isPieceType(type)) return reject('not_found');
  if (req.rotation !== undefined && !isRotation(req.rotation)) return reject('not_found');

  const gridX = asInteger(req.gridX);
  const gridZ = asInteger(req.gridZ);
  if (gridX === null || gridZ === null) return reject('out_of_bounds');

  const reason = checkFootprint(ctx.pieces, type, gridX, gridZ, { isNew: true });
  if (reason) return reject(reason);

  const start: Rotation = req.rotation === undefined ? 0 : req.rotation;
  const rotation = req.autoAdjust === true ? resolveAutoRotation(ctx.pieces, type, gridX, gridZ, start) : start;

  const piece: Piece = { id: uniqueId(ctx.pieces, ctx.newId), type, gridX, gridZ, rotation };
  const pieces = [...ctx.pieces.map(copyPiece), piece];
  return {
    ok: true,
    pieces,
    entry: { kind: 'place', piece: copyPiece(piece), index: pieces.length - 1 },
    id: piece.id,
    sound: 'place',
    snap: newConnections(ctx.pieces, pieces).length > 0,
  };
}

function move(ctx: BuildContext, req: Extract<BuildRequest, { kind: 'move' }>): BuildOutcome {
  const at = findIndex(ctx.pieces, req.id);
  if (at < 0) return reject('not_found');
  if (req.rotation !== undefined && !isRotation(req.rotation)) return reject('not_found');

  const gridX = asInteger(req.gridX);
  const gridZ = asInteger(req.gridZ);
  if (gridX === null || gridZ === null) return reject('out_of_bounds');

  const current = ctx.pieces[at]!;
  const reason = checkFootprint(ctx.pieces, current.type, gridX, gridZ, {
    movingId: current.id,
    isNew: false,
  });
  if (reason) return reject(reason);

  // Moves never auto-adjust (Requirement 15.7).
  const rotation: Rotation = req.rotation === undefined ? current.rotation : req.rotation;
  const pieces = ctx.pieces.map(copyPiece);

  if (gridX === current.gridX && gridZ === current.gridZ && rotation === current.rotation) {
    return { ok: true, pieces, entry: null, sound: 'move', snap: false };
  }

  pieces[at] = { ...pieces[at]!, gridX, gridZ, rotation };
  return {
    ok: true,
    pieces,
    entry: {
      kind: 'move',
      id: current.id,
      from: { gridX: current.gridX, gridZ: current.gridZ, rotation: current.rotation },
      to: { gridX, gridZ, rotation },
    },
    sound: 'move',
    snap: newConnections(ctx.pieces, pieces).length > 0,
  };
}

function rotate(ctx: BuildContext, req: Extract<BuildRequest, { kind: 'rotate' }>): BuildOutcome {
  const at = findIndex(ctx.pieces, req.id);
  if (at < 0) return reject('not_found');

  // Rotation never changes a footprint (1 × 1 tracks, the hill keeps its 4 tiles),
  // so no footprint check is needed (Assumption 6, Requirement 28.18).
  const current = ctx.pieces[at]!;
  const to = nextRotation(current.rotation);
  const pieces = ctx.pieces.map(copyPiece);
  pieces[at] = { ...pieces[at]!, rotation: to };
  return {
    ok: true,
    pieces,
    entry: { kind: 'rotate', id: current.id, from: current.rotation, to },
    sound: 'rotate',
    snap: newConnections(ctx.pieces, pieces).length > 0,
  };
}

function remove(ctx: BuildContext, req: Extract<BuildRequest, { kind: 'remove' }>): BuildOutcome {
  const at = findIndex(ctx.pieces, req.id);
  if (at < 0) return reject('not_found');

  const removed = copyPiece(ctx.pieces[at]!);
  const pieces = ctx.pieces.filter((_, i) => i !== at).map(copyPiece);
  return {
    ok: true,
    pieces,
    entry: { kind: 'remove', piece: removed, index: at },
    sound: 'delete',
    snap: false,
  };
}

/** Validates and applies one build request. Never throws on bad request values. */
export function applyBuild(ctx: BuildContext, req: BuildRequest): BuildOutcome {
  if (ctx.mode === 'play') return reject('play_mode');
  if (typeof req !== 'object' || req === null) return reject('not_found');
  switch (req.kind) {
    case 'place':
      return place(ctx, req);
    case 'move':
      return move(ctx, req);
    case 'rotate':
      return rotate(ctx, req);
    case 'remove':
      return remove(ctx, req);
    default:
      return reject('not_found');
  }
}
