import { CATALOG, isTrackType } from './catalog'
import { connectorsOf, footprint, isOnGrid, nextRotation, opposite, sideDelta } from './grid'
import type { Piece, PieceType, Reason, Rotation, Side } from './types'

interface Candidate {
  type: PieceType
  gridX: number
  gridZ: number
}

const tileKey = (gridX: number, gridZ: number) => gridX * 16 + gridZ

const buildOccupancy = (pieces: Piece[], ignoreId?: string) => {
  const occupancy = new Map<number, Piece>()
  for (const piece of pieces) {
    if (piece.id === ignoreId) continue
    for (const [x, z] of footprint(piece.type, piece.gridX, piece.gridZ)) {
      occupancy.set(tileKey(x, z), piece)
    }
  }
  return occupancy
}

/** FR-8. Returns null when the placement is allowed. */
export const validate = (
  pieces: Piece[],
  candidate: Candidate,
  ignoreId?: string,
): Reason | null => {
  const cells = footprint(candidate.type, candidate.gridX, candidate.gridZ)
  if (!cells.every(([x, z]) => isOnGrid(x, z))) return 'out_of_bounds'
  if (
    candidate.type === 'station' &&
    pieces.some((piece) => piece.type === 'station' && piece.id !== ignoreId)
  ) {
    return 'station_limit'
  }
  const occupancy = buildOccupancy(pieces, ignoreId)
  const blockers = cells.flatMap(([x, z]) => occupancy.get(tileKey(x, z)) ?? [])
  if (blockers.length === 0) return null
  const landsOnTrack = !isTrackType(candidate.type) && blockers.some((b) => isTrackType(b.type))
  return landsOnTrack ? 'on_track' : 'occupied'
}

const trackAt = (occupancy: Map<number, Piece>, gridX: number, gridZ: number) => {
  const piece = occupancy.get(tileKey(gridX, gridZ))
  return piece && isTrackType(piece.type) ? piece : undefined
}

export const connectedNeighbour = (
  occupancy: Map<number, Piece>,
  piece: Pick<Piece, 'gridX' | 'gridZ'>,
  side: Side,
) => {
  const [dx, dz] = sideDelta[side]
  const neighbour = trackAt(occupancy, piece.gridX + dx, piece.gridZ + dz)
  return neighbour && connectorsOf(neighbour).includes(opposite(side)) ? neighbour : undefined
}

export const trackOccupancy = (pieces: Piece[]) => buildOccupancy(pieces.filter((p) => isTrackType(p.type)))

/** Pairs of connected track ids, each pair once, ordered as the pieces array. */
export const findConnections = (pieces: Piece[]): [string, string][] => {
  const occupancy = trackOccupancy(pieces)
  const order = new Map(pieces.map((piece, index) => [piece.id, index]))
  const pairs: [string, string][] = []
  for (const piece of pieces) {
    if (!isTrackType(piece.type)) continue
    for (const side of connectorsOf(piece)) {
      const neighbour = connectedNeighbour(occupancy, piece, side)
      if (neighbour && order.get(piece.id)! < order.get(neighbour.id)!) {
        pairs.push([piece.id, neighbour.id])
      }
    }
  }
  return pairs
}

export interface OpenEnd {
  gridX: number
  gridZ: number
  side: Side
}

export const openEnds = (pieces: Piece[]): OpenEnd[] => {
  const occupancy = trackOccupancy(pieces)
  return pieces.flatMap((piece) =>
    isTrackType(piece.type)
      ? connectorsOf(piece)
          .filter((side) => !connectedNeighbour(occupancy, piece, side))
          .map((side) => ({ gridX: piece.gridX, gridZ: piece.gridZ, side }))
      : [],
  )
}

/** AC-7.3: the rotation a dropped track settles on. Pieces must not include the dropped one. */
export const autoRotate = (
  pieces: Piece[],
  candidate: Candidate & { rotation: Rotation },
): Rotation => {
  if (!isTrackType(candidate.type)) return candidate.rotation
  const occupancy = trackOccupancy(pieces)
  const sidesFacingUs = (['N', 'E', 'S', 'W'] as Side[]).filter((side) =>
    connectedNeighbour(occupancy, candidate, side),
  )
  if (sidesFacingUs.length === 0) return candidate.rotation

  let rotation = candidate.rotation
  for (let turn = 0; turn < 4; turn++) {
    const connectors = connectorsOf({ type: candidate.type, rotation })
    if (connectors.some((side) => sidesFacingUs.includes(side))) return rotation
    rotation = nextRotation(rotation)
  }
  return candidate.rotation
}

export const pieceHeight = (type: PieceType) => CATALOG[type].pick[2]
