import { isTrack } from './catalogue'
import { buildTileIndex, countConnections, trackNeighbour } from './connections'
import { dirDelta, footprint, inBounds, opposite, pieceConnectors, tileKey } from './grid'
import type { Dir, Piece, PieceType, ReasonCode, Rotation } from './types'

export interface Candidate {
  type: PieceType
  gx: number
  gz: number
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270]

/**
 * FR-8 placement rules. Returns null when valid, otherwise the reason code.
 * Precedence (D8): out_of_bounds → station_limit → on_track → occupied.
 * `ignoreId` excludes the piece being moved.
 */
export function validatePlacement(pieces: Piece[], c: Candidate, ignoreId?: string): ReasonCode | null {
  const tiles = footprint(c.type, c.gx, c.gz)
  if (!tiles.every((t) => inBounds(t.gx, t.gz))) return 'out_of_bounds'

  const others = ignoreId ? pieces.filter((p) => p.id !== ignoreId) : pieces
  if (c.type === 'station' && others.some((p) => p.type === 'station')) return 'station_limit'

  const index = buildTileIndex(others)
  const hits = tiles.map((t) => index.get(tileKey(t.gx, t.gz))).filter((p): p is Piece => !!p)
  if (hits.length === 0) return null
  if (!isTrack(c.type) && hits.some((p) => isTrack(p.type))) return 'on_track'
  return 'occupied'
}

/**
 * AC-7.3 auto-adjust: a track dropped next to an open end facing it, whose current rotation
 * would leave it unconnected, turns clockwise to the first rotation that connects.
 */
export function autoAdjustRotation(
  pieces: Piece[],
  c: Candidate & { rotation: Rotation },
  ignoreId?: string,
): Rotation {
  if (!isTrack(c.type)) return c.rotation
  const others = ignoreId ? pieces.filter((p) => p.id !== ignoreId) : pieces
  if (!hasOpenEndFacing(others, c.gx, c.gz)) return c.rotation

  const start = ROTATIONS.indexOf(c.rotation)
  for (let i = 0; i < 4; i++) {
    const rotation = ROTATIONS[(start + i) % 4]
    const probe: Piece = { id: '__probe__', type: c.type, gridX: c.gx, gridZ: c.gz, rotation }
    if (countConnections([...others, probe], probe) > 0) return rotation
  }
  return c.rotation
}

function hasOpenEndFacing(pieces: Piece[], gx: number, gz: number): boolean {
  const index = buildTileIndex(pieces)
  return (['N', 'E', 'S', 'W'] as Dir[]).some((dir) => {
    const { dx, dz } = dirDelta(dir)
    const neighbour = index.get(tileKey(gx + dx, gz + dz))
    if (!neighbour || !isTrack(neighbour.type)) return false
    const towardsUs = opposite(dir)
    return pieceConnectors(neighbour).includes(towardsUs) && !trackNeighbour(index, neighbour, towardsUs)
  })
}
