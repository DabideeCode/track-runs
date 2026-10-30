/**
 * Pure layout rules for the static piece layers (task 14.11; design.md
 * sections 7.4 and 8; Requirements 14.1, 14.6, 28.17, 28.19, 31.9).
 *
 * No React, Three.js or DOM imports, so the rules are testable in Node and
 * shared by `PieceLayer`, `BlobShadows`, `OpenEndMarkers`, `PickProxies` and
 * `ActivePiece` (task 14.12).
 *
 * Active and static pieces: a piece is *active* while it is selected or being
 * dragged from the board. Active pieces are drawn by `ActivePiece` with
 * ordinary meshes (outline, lift, follow, tilt), together with their contact
 * shadow. Every other piece is *static* and drawn by the instanced layers.
 * `isActivePiece` is the single rule both sides use, so each piece is drawn
 * exactly once. Deleted pieces leave `pieces` at once; their 200 ms exit copy
 * belongs to `ActivePiece`.
 */
import { dirDelta } from '@/domain/connectors';
import type { OpenEnd } from '@/domain/connections';
import { GRID, footprintCentre, tileCentre } from '@/domain/grid';
import type { Piece } from '@/domain/types';

/** Most pieces a diorama can hold: one per tile. Sizes every instanced buffer. */
export const MAX_PIECES = GRID * GRID;
/** Most open ends: two connectors per track. */
export const MAX_OPEN_ENDS = MAX_PIECES * 2;

/** The store fields that decide which pieces are active. */
export interface ActiveSelection {
  selectedPieceId: string | null;
  drag: { pieceId: string | null } | null;
}

/** True when `id` is drawn by `ActivePiece`: the selected piece or the board-dragged piece. */
export function isActivePiece(id: string, sel: ActiveSelection): boolean {
  return id === sel.selectedPieceId || (sel.drag !== null && sel.drag.pieceId === id);
}

/** Ids of the active pieces that exist in `pieces`, in piece order (at most 2). */
export function activePieceIds(pieces: readonly Piece[], sel: ActiveSelection): string[] {
  return pieces.filter((p) => isActivePiece(p.id, sel)).map((p) => p.id);
}

/**
 * The pieces the instanced layers draw: every piece except the active ones,
 * in store order. Returns `pieces` itself when nothing is active, so memoised
 * consumers keep their identity.
 */
export function staticPieces(pieces: readonly Piece[], sel: ActiveSelection): readonly Piece[] {
  if (!pieces.some((p) => isActivePiece(p.id, sel))) return pieces;
  return pieces.filter((p) => !isActivePiece(p.id, sel));
}

/** Rest pose of a piece: footprint centre on the ground and `rotation.y = −rotation × π / 180`. */
export interface RestTransform {
  x: number;
  z: number;
  /** Three.js `rotation.y` in degrees (0, −90, −180 or −270). */
  yawDeg: number;
  /** Three.js `rotation.y` in radians. */
  yaw: number;
}

/** Where a piece rests (Requirements 14.1, 28.17, 28.19). */
export function pieceRestTransform(piece: Pick<Piece, 'type' | 'gridX' | 'gridZ' | 'rotation'>): RestTransform {
  const c = footprintCentre(piece.type, piece.gridX, piece.gridZ);
  const yawDeg = piece.rotation === 0 ? 0 : -piece.rotation;
  return { x: c.x, z: c.z, yawDeg, yaw: (yawDeg * Math.PI) / 180 };
}

/** The store fields that decide hover. */
export interface HoverInputs {
  mode: 'build' | 'play';
  drag: unknown;
  hoverPieceId: string | null;
}

/**
 * True while `id` is raised by the hover lift: the pointer is over it in Build
 * mode and no drag is active (Requirement 31.9).
 */
export function isHoverLifted(id: string, s: HoverInputs): boolean {
  return s.mode === 'build' && s.drag === null && s.hoverPieceId === id;
}

/** Canvas cursor: `pointer` over a hoverable piece, otherwise the default (Requirement 31.9). */
export function cursorFor(s: HoverInputs): 'pointer' | '' {
  return s.mode === 'build' && s.drag === null && s.hoverPieceId !== null ? 'pointer' : '';
}

/**
 * Ids in `pieces` that were not in `previous`. These pieces play the drop
 * animation when they first appear. With no previous set (the layer's first
 * render, for example after opening a diorama) nothing counts as new.
 */
export function newlyAddedIds(previous: ReadonlySet<string> | null, pieces: readonly Piece[]): Set<string> {
  const added = new Set<string>();
  if (previous === null) return added;
  for (const p of pieces) if (!previous.has(p.id)) added.add(p.id);
  return added;
}

// ---------------------------------------------------------------------------
// Open-end markers
// ---------------------------------------------------------------------------

/** Open-end peg size in tiles. Requirement 14.6 allows at most 0.25 wide. */
export const OPEN_END_PEG = {
  /** Full width (diameter). */
  width: 0.18,
  /** Height above the ground; the rail top is at 0.08, so the peg shows above it. */
  height: 0.13,
} as const;

/** A marker position: the midpoint of the open connector's tile edge, on the ground. */
export interface MarkerPosition {
  pieceId: string;
  x: number;
  z: number;
}

/**
 * One marker per open end at the midpoint of the tile edge it faces
 * (Requirement 14.6). Ends of `hiddenPieceId` (the piece being dragged off
 * its tile) are left out, since that piece is lifted away from those edges.
 */
export function openEndMarkerPositions(ends: readonly OpenEnd[], hiddenPieceId: string | null = null): MarkerPosition[] {
  const out: MarkerPosition[] = [];
  for (const end of ends) {
    if (end.pieceId === hiddenPieceId) continue;
    const c = tileCentre(end.tile.gridX, end.tile.gridZ);
    const d = dirDelta(end.dir);
    out.push({ pieceId: end.pieceId, x: c.x + d.dx * 0.5, z: c.z + d.dz * 0.5 });
  }
  return out;
}
