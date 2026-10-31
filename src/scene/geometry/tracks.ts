import { ExtrudeGeometry, Path, Shape, type BufferGeometry } from 'three';
import type { TrackType } from '@/domain/types';
import { box, cylinder, merge, sweep, type PathPoint, type PieceParts } from './parts';

export const BUFFER_END_Z = -0.3;

const HALF = 0.31;
const TOP = 0.09;
const SHOULDER = 0.07;
const GROOVE_OUT = 0.165;
const GROOVE_IN = 0.095;
const GROOVE_FLOOR = 0.06;

/** Plank cross-section with two wheel grooves and softened top edges, counter-clockwise. */
const PROFILE = [
  [-HALF, 0],
  [HALF, 0],
  [HALF, SHOULDER],
  [HALF - 0.02, TOP],
  [GROOVE_OUT, TOP],
  [GROOVE_OUT - 0.008, GROOVE_FLOOR],
  [GROOVE_IN + 0.008, GROOVE_FLOOR],
  [GROOVE_IN, TOP],
  [-GROOVE_IN, TOP],
  [-GROOVE_IN - 0.008, GROOVE_FLOOR],
  [-GROOVE_OUT + 0.008, GROOVE_FLOOR],
  [-GROOVE_OUT, TOP],
  [-HALF + 0.02, TOP],
  [-HALF, SHOULDER],
] as const;

function straightPath(fromZ: number, toZ: number) {
  return (t: number): PathPoint => ({ x: 0, z: fromZ + (toZ - fromZ) * t, tx: 0, tz: -1 });
}

/** Quarter circle of radius 0.5, centred on the south-east corner, from the south to the east edge. */
function curvePath(t: number): PathPoint {
  const angle = Math.PI + (Math.PI / 2) * t;
  return {
    x: 0.5 + 0.5 * Math.cos(angle),
    z: 0.5 + 0.5 * Math.sin(angle),
    tx: -Math.sin(angle),
    tz: Math.cos(angle),
  };
}

const plank = (fromZ = 0.5, toZ = -0.5) => sweep(PROFILE, straightPath(fromZ, toZ), fromZ - toZ, 1);

function tunnelShell(): BufferGeometry {
  const outerHalf = 0.47;
  const innerHalf = 0.35;
  const springing = 0.42;
  const shape = new Shape();
  shape.moveTo(-outerHalf, 0);
  shape.lineTo(outerHalf, 0);
  shape.lineTo(outerHalf, springing);
  shape.absarc(0, springing, outerHalf, 0, Math.PI, false);
  shape.lineTo(-outerHalf, 0);
  const hole = new Path();
  hole.moveTo(-innerHalf, 0.02);
  hole.lineTo(-innerHalf, springing);
  hole.absarc(0, springing, innerHalf, Math.PI, 0, true);
  hole.lineTo(innerHalf, 0.02);
  hole.lineTo(-innerHalf, 0.02);
  shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.92,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -0.46);
  return geometry;
}

const BUILDERS: Record<TrackType, () => PieceParts> = {
  straight: () => [{ material: 'wood', geometry: plank() }],
  curve: () => [{ material: 'wood', geometry: sweep(PROFILE, curvePath, Math.PI / 4, 12) }],
  tunnel: () => [
    { material: 'wood', geometry: plank() },
    { material: 'paintDusty', geometry: tunnelShell() },
  ],
  station: () => [
    { material: 'wood', geometry: merge(plank(), box(0.17, 0.13, 0.92, [0.41, 0.065, 0], 0.025)) },
    {
      material: 'paintCream',
      geometry: merge(
        cylinder(0.025, 0.025, 0.72, [0.43, 0.37, 0.36]),
        cylinder(0.025, 0.025, 0.72, [0.43, 0.37, -0.36]),
        cylinder(0.025, 0.025, 0.72, [-0.43, 0.37, 0.36]),
        cylinder(0.025, 0.025, 0.72, [-0.43, 0.37, -0.36]),
      ),
    },
    { material: 'paintTerracotta', geometry: box(0.98, 0.09, 0.86, [0, 0.77, 0], 0.03) },
  ],
  buffer: () => [
    { material: 'wood', geometry: plank(0.5, -0.46) },
    { material: 'paintTerracotta', geometry: box(0.56, 0.16, 0.14, [0, 0.23, -0.37], 0.04) },
    { material: 'woodDark', geometry: merge(box(0.1, 0.16, 0.14, [-0.17, 0.08, -0.37]), box(0.1, 0.16, 0.14, [0.17, 0.08, -0.37])) },
  ],
};

export const buildTrack = (type: TrackType): PieceParts => BUILDERS[type]();
