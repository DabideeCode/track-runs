import type { Edge } from './catalogue';
import { EDGE_DELTA, OPPOSITE } from './connectors';
import { tileToWorld } from './grid';
import type { Piece } from './types';

export const CURVE_LENGTH = Math.PI / 4;
export const BUFFER_LENGTH = 0.8;

export interface PathPoint {
  x: number;
  z: number;
  /** Unit heading along the path. */
  hx: number;
  hz: number;
}

export interface PiecePath {
  length: number;
  point(t: number): PathPoint;
}

interface Flat {
  x: number;
  z: number;
}

const edgeMid = (centre: Flat, edge: Edge): Flat => ({
  x: centre.x + EDGE_DELTA[edge].x * 0.5,
  z: centre.z + EDGE_DELTA[edge].z * 0.5,
});

function line(from: Flat, to: Flat): PiecePath {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const hx = (to.x - from.x) / length;
  const hz = (to.z - from.z) / length;
  return {
    length,
    point: (t) => ({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, hx, hz }),
  };
}

/** Quarter circle of radius 0.5 around the corner shared by two adjacent edges. */
function arc(centre: Flat, from: Edge, to: Edge): PiecePath {
  const corner = {
    x: centre.x + (EDGE_DELTA[from].x + EDGE_DELTA[to].x) * 0.5,
    z: centre.z + (EDGE_DELTA[from].z + EDGE_DELTA[to].z) * 0.5,
  };
  const start = edgeMid(centre, from);
  const end = edgeMid(centre, to);
  const startAngle = Math.atan2(start.z - corner.z, start.x - corner.x);
  const endAngle = Math.atan2(end.z - corner.z, end.x - corner.x);
  let sweep = endAngle - startAngle;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const sign = Math.sign(sweep);
  return {
    length: CURVE_LENGTH,
    point: (t) => {
      const angle = startAngle + sweep * t;
      return {
        x: corner.x + 0.5 * Math.cos(angle),
        z: corner.z + 0.5 * Math.sin(angle),
        hx: -Math.sin(angle) * sign,
        hz: Math.cos(angle) * sign,
      };
    },
  };
}

/** The centreline through a piece. `null` for an end means the stop block of a buffer. */
export function piecePath(piece: Piece, from: Edge | null, to: Edge | null): PiecePath {
  const centre = tileToWorld({ x: piece.gridX, z: piece.gridZ });
  if (from && to && piece.type === 'curve') return arc(centre, from, to);
  const blockPoint = (connector: Edge): Flat => ({
    x: centre.x + EDGE_DELTA[OPPOSITE[connector]].x * (BUFFER_LENGTH - 0.5),
    z: centre.z + EDGE_DELTA[OPPOSITE[connector]].z * (BUFFER_LENGTH - 0.5),
  });
  const start = from ? edgeMid(centre, from) : blockPoint(to!);
  const end = to ? edgeMid(centre, to) : blockPoint(from!);
  return line(start, end);
}
