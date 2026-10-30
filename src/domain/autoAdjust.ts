/**
 * Track auto-adjust (Requirement 15, design §1.5).
 *
 * When a new track is placed next to an open end, choose the rotation that
 * joins it. The rule, in order:
 *
 * 1. Decorations keep `current`.
 * 2. If no edge-adjacent track has a connector facing the target tile, keep
 *    `current`. With the target tile free, every such facing connector is an
 *    open end.
 * 3. If `current` already creates a connection, keep it (Requirement 15.6).
 * 4. Otherwise return the first of current + 90, + 180, + 270 (mod 360) that
 *    creates a connection (Requirement 15.1).
 * 5. Otherwise keep `current` (Requirement 15.2).
 *
 * A rotation "creates a connection" when the new track has a connector d and
 * the track across edge d has the connector opposite(d). Any piece occupying
 * the target tile itself is ignored; the placement engine rejects that case
 * separately.
 */
import { isTrackType } from './catalogue';
import { neighbourAcross } from './connections';
import { connectorsOf, nextRotation } from './connectors';
import { buildOccupancy } from './occupancy';
import type { Dir, Piece, PieceType, Rotation } from './types';

const ALL_DIRS: readonly Dir[] = [0, 1, 2, 3];

/** An id that no real piece can have, so the candidate never matches itself. */
const CANDIDATE_ID = '\u0000auto-adjust-candidate';

/** The rotation a newly placed piece of `type` at (gridX, gridZ) should get. */
export function resolveAutoRotation(
  pieces: readonly Piece[],
  type: PieceType,
  gridX: number,
  gridZ: number,
  current: Rotation,
): Rotation {
  if (!isTrackType(type)) return current;

  const index = buildOccupancy(pieces);
  const candidate: Piece = { id: CANDIDATE_ID, type, gridX, gridZ, rotation: current };

  // Edges of the target tile that an adjacent track's connector faces.
  const facing = new Set<Dir>(ALL_DIRS.filter((d) => neighbourAcross(index, candidate, d) !== null));
  if (facing.size === 0) return current;

  const connects = (rotation: Rotation): boolean =>
    connectorsOf({ type, rotation }).some((d) => facing.has(d));

  let rotation = current;
  for (let step = 0; step < 4; step++) {
    if (connects(rotation)) return rotation;
    rotation = nextRotation(rotation);
  }
  return current;
}
