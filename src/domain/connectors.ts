/**
 * Connector directions and rotation helpers.
 *
 * Directions: 0 = N (−Z), 1 = E (+X), 2 = S (+Z), 3 = W (−X).
 * Rotations are clockwise viewed from above, so one 90° step turns N into E.
 */
import { itemOf } from './catalogue';
import type { Dir, Piece, Rotation } from './types';

/** Turn a direction clockwise by a rotation: (d + r / 90) mod 4. */
export function rotateDir(d: Dir, r: Rotation): Dir {
  return ((d + r / 90) % 4) as Dir;
}

/** The opposite direction: (d + 2) mod 4. */
export function opposite(d: Dir): Dir {
  return ((d + 2) % 4) as Dir;
}

const DELTAS: readonly { dx: number; dz: number }[] = [
  { dx: 0, dz: -1 }, // N
  { dx: 1, dz: 0 }, // E
  { dx: 0, dz: 1 }, // S
  { dx: -1, dz: 0 }, // W
];

/** Grid offset of the neighbouring tile across edge `d`. */
export function dirDelta(d: Dir): { dx: number; dz: number } {
  const { dx, dz } = DELTAS[d];
  return { dx, dz };
}

/** A piece's connectors after rotation, in catalogue order. Decorations have none. */
export function connectorsOf(p: Pick<Piece, 'type' | 'rotation'>): Dir[] {
  return itemOf(p.type).connectors0.map((d) => rotateDir(d, p.rotation));
}

/** Next rotation in the clockwise cycle 0 → 90 → 180 → 270 → 0. */
export function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation;
}
