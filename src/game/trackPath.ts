import { CATALOGUE } from './catalogue'
import { pieceConnectors, tileCenter } from './grid'
import type { Dir, Piece, PieceType } from './types'

/** Where the buffer stop's rail ends, in local z (the stop block fills the rest of the tile). */
export const BUFFER_END_Z = -0.25
const CURVE_RADIUS = 0.5

/** Length of a track piece's centreline in tiles. */
export function pathLength(type: PieceType): number {
  switch (type) {
    case 'curve':
      return (Math.PI / 2) * CURVE_RADIUS
    case 'buffer':
      return 0.5 - BUFFER_END_Z
    default:
      return 1
  }
}

export interface PathSample {
  x: number
  z: number
  /** Yaw of the +u tangent; 0 points to +Z (south), π/2 to +X (east). */
  heading: number
}

/** Local point and tangent at distance u along the canonical path, at rotation 0. */
function localSample(type: PieceType, u: number): { x: number; z: number; tx: number; tz: number } {
  switch (type) {
    case 'curve': {
      // Quarter circle about the south-east corner, from the S edge to the E edge.
      const a = Math.PI + u / CURVE_RADIUS
      return {
        x: 0.5 + CURVE_RADIUS * Math.cos(a),
        z: 0.5 + CURVE_RADIUS * Math.sin(a),
        tx: -Math.sin(a),
        tz: Math.cos(a),
      }
    }
    case 'buffer':
      return { x: 0, z: 0.5 - u, tx: 0, tz: -1 }
    default:
      return { x: 0, z: -0.5 + u, tx: 0, tz: 1 }
  }
}

/** World-space point and heading at distance u along a placed piece's canonical path. */
export function samplePath(piece: Piece, u: number): PathSample {
  const l = localSample(piece.type, u)
  const t = (piece.rotation * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  // Clockwise (viewed from above) rotation in x-east / z-south coordinates.
  const x = l.x * cos - l.z * sin
  const z = l.x * sin + l.z * cos
  const tx = l.tx * cos - l.tz * sin
  const tz = l.tx * sin + l.tz * cos
  const c = tileCenter(piece.gridX, piece.gridZ)
  return { x: c.x + x, z: c.z + z, heading: Math.atan2(tx, tz) }
}

/** World edges at u = 0 and u = L; a null end is a dead end (buffer stop). */
export function pathEnds(piece: Piece): { startDir: Dir; endDir: Dir | null } {
  const [startDir, endDir] = pieceConnectors(piece)
  return { startDir, endDir: CATALOGUE[piece.type].connectors.length > 1 ? endDir : null }
}
