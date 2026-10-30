import { connectorsAt, isTrack, nextRotation } from './catalog';
import { connectedNeighbour, trackTiles } from './connections';
import type { Piece, Rotation } from './types';

function connectsAt(tracks: ReadonlyMap<string, Piece>, candidate: Piece, rotation: Rotation) {
  const rotated = { ...candidate, rotation };
  return connectorsAt(rotated.type, rotation).some((direction) =>
    connectedNeighbour(tracks, rotated, direction),
  );
}

// `others` must not contain the candidate itself.
export function autoAdjustRotation(others: readonly Piece[], candidate: Piece): Rotation {
  if (!isTrack(candidate.type)) return candidate.rotation;
  const tracks = trackTiles(others);
  let rotation = candidate.rotation;
  for (let step = 0; step < 4; step += 1) {
    if (connectsAt(tracks, candidate, rotation)) return rotation;
    rotation = nextRotation(rotation);
  }
  return candidate.rotation;
}
