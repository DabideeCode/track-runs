import { CATALOGUE } from '@/domain/catalogue';
import { footprintCentre } from '@/domain/grid';
import type { Piece } from '@/domain/types';
import type { Ray } from './pointerMath';

/** Distance along the ray to a box, using the slab method, or null on a miss. */
function hitBox(ray: Ray, min: [number, number, number], max: [number, number, number]): number | null {
  const origin = [ray.origin.x, ray.origin.y, ray.origin.z];
  const direction = [ray.direction.x, ray.direction.y, ray.direction.z];
  let near = 0;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const d = direction[axis]!;
    const o = origin[axis]!;
    const lo = min[axis]!;
    const hi = max[axis]!;
    if (d === 0) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const a = (lo - o) / d;
    const b = (hi - o) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}

/** The piece whose box the ray enters first, so a tall tree wins over the tile behind its top. */
export function pickPiece(ray: Ray, pieces: readonly Piece[]): Piece | null {
  let best: Piece | null = null;
  let bestDistance = Infinity;
  for (const piece of pieces) {
    const item = CATALOGUE[piece.type];
    const centre = footprintCentre(piece.type, piece.gridX, piece.gridZ);
    const halfX = item.footprint[0] / 2;
    const halfZ = item.footprint[1] / 2;
    const distance = hitBox(
      ray,
      [centre.x - halfX, 0, centre.z - halfZ],
      [centre.x + halfX, item.height, centre.z + halfZ],
    );
    if (distance !== null && distance < bestDistance) {
      best = piece;
      bestDistance = distance;
    }
  }
  return best;
}
