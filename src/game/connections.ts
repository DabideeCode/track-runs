import { isTrack } from './catalogue'
import { dirDelta, footprint, opposite, pieceConnectors, tileKey } from './grid'
import type { Dir, Piece } from './types'

export type TileIndex = Map<string, Piece>

/** Map of every occupied tile ("gx,gz") to the piece covering it. */
export function buildTileIndex(pieces: Piece[]): TileIndex {
  const index: TileIndex = new Map()
  for (const piece of pieces) {
    for (const t of footprint(piece.type, piece.gridX, piece.gridZ)) index.set(tileKey(t.gx, t.gz), piece)
  }
  return index
}

/** The track connected to `piece` across its `dir` edge, if both sides have a connector there. */
export function trackNeighbour(index: TileIndex, piece: Piece, dir: Dir): Piece | null {
  if (!isTrack(piece.type) || !pieceConnectors(piece).includes(dir)) return null
  const { dx, dz } = dirDelta(dir)
  const other = index.get(tileKey(piece.gridX + dx, piece.gridZ + dz))
  if (!other || other.id === piece.id || !isTrack(other.type)) return null
  return pieceConnectors(other).includes(opposite(dir)) ? other : null
}

/** Every pair of connected track ids, each pair once, sorted. */
export function getConnections(pieces: Piece[]): Array<[string, string]> {
  const index = buildTileIndex(pieces)
  const seen = new Set<string>()
  const pairs: Array<[string, string]> = []
  for (const piece of pieces) {
    for (const dir of pieceConnectors(piece)) {
      const other = trackNeighbour(index, piece, dir)
      if (!other) continue
      const pair: [string, string] = piece.id < other.id ? [piece.id, other.id] : [other.id, piece.id]
      const key = pair.join('|')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push(pair)
    }
  }
  return pairs.sort((a, b) => (a[0] + '|' + a[1]).localeCompare(b[0] + '|' + b[1]))
}

/** Track connectors with no connected neighbour. */
export function openEnds(pieces: Piece[]): Array<{ pieceId: string; dir: Dir }> {
  const index = buildTileIndex(pieces)
  const ends: Array<{ pieceId: string; dir: Dir }> = []
  for (const piece of pieces) {
    for (const dir of pieceConnectors(piece)) {
      if (!trackNeighbour(index, piece, dir)) ends.push({ pieceId: piece.id, dir })
    }
  }
  return ends
}

/** Number of tracks `piece` connects to within `pieces` (which must include it). */
export function countConnections(pieces: Piece[], piece: Piece): number {
  const index = buildTileIndex(pieces)
  return pieceConnectors(piece).filter((dir) => trackNeighbour(index, piece, dir)).length
}

/** One key per connected connector, including where it is, so a connection that moves counts as new. */
export function connectionKeys(pieces: Piece[]): string[] {
  const index = buildTileIndex(pieces)
  const keys: string[] = []
  for (const piece of pieces) {
    for (const dir of pieceConnectors(piece)) {
      if (trackNeighbour(index, piece, dir)) keys.push(`${piece.id}@${piece.gridX},${piece.gridZ}:${dir}`)
    }
  }
  return keys
}
