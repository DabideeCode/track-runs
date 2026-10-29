import type { DecorationType, Dir, PieceType, TrackType } from './types'

export interface CatalogueItem {
  type: PieceType
  label: string
  kind: 'track' | 'decoration'
  /** Footprint edge length in tiles (1 or 2). */
  size: 1 | 2
  /** Connectors at rotation 0, in canonical path order (§6, D13). */
  connectors: Dir[]
}

const track = (type: TrackType, label: string, connectors: Dir[]): CatalogueItem => ({
  type,
  label,
  kind: 'track',
  size: 1,
  connectors,
})

const deco = (type: DecorationType, label: string, size: 1 | 2 = 1): CatalogueItem => ({
  type,
  label,
  kind: 'decoration',
  size,
  connectors: [],
})

export const CATALOGUE: Record<PieceType, CatalogueItem> = {
  straight: track('straight', 'Straight track', ['N', 'S']),
  curve: track('curve', 'Curved track', ['S', 'E']),
  tunnel: track('tunnel', 'Tunnel', ['N', 'S']),
  station: track('station', 'Station', ['N', 'S']),
  buffer: track('buffer', 'Buffer stop', ['S']),
  house: deco('house', 'Toy house'),
  pineTree: deco('pineTree', 'Pine tree'),
  roundTree: deco('roundTree', 'Round tree'),
  hill: deco('hill', 'Hill', 2),
  car: deco('car', 'Toy car'),
  cassette: deco('cassette', 'Cassette tape'),
  blocks: deco('blocks', 'Building blocks'),
}

export const TRACK_TYPES: TrackType[] = ['straight', 'curve', 'tunnel', 'station', 'buffer']
export const DECORATION_TYPES: DecorationType[] = [
  'house',
  'pineTree',
  'roundTree',
  'hill',
  'car',
  'cassette',
  'blocks',
]
export const PIECE_TYPES: PieceType[] = [...TRACK_TYPES, ...DECORATION_TYPES]

export function isTrack(type: PieceType): type is TrackType {
  return CATALOGUE[type].kind === 'track'
}
