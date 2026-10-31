import { isTrack, nextRotation } from './catalogue';
import { connectedNeighbour, connectorsFor } from './connectors';
import { buildOccupancy } from './grid';
import type { Piece, PieceType, Rotation } from './types';

/**
 * AC-7.3: a track that would stay unconnected turns to the first clockwise rotation that joins a
 * neighbour's open end. It counts as unconnected only with no connection to any neighbour.
 */
export function autoAdjustRotation(
  type: PieceType,
  gridX: number,
  gridZ: number,
  rotation: Rotation,
  pieces: readonly Piece[],
  ignoreId: string | null = null,
): Rotation {
  if (!isTrack(type)) return rotation;
  const occupancy = buildOccupancy(pieces.filter((piece) => piece.id !== ignoreId));
  const connects = (candidate: Rotation) =>
    connectorsFor(type, candidate).some((edge) => connectedNeighbour({ gridX, gridZ }, edge, occupancy));

  let candidate = rotation;
  for (let step = 0; step < 4; step++) {
    if (connects(candidate)) return candidate;
    candidate = nextRotation(candidate);
  }
  return rotation;
}
