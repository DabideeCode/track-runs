import type { DecorationType, PieceType, Side, TrackType } from './types'

export interface CatalogItem {
  type: PieceType
  label: string
  kind: 'track' | 'decoration'
  /** Tiles along each axis. */
  size: 1 | 2
  /** Connectors at 0 degrees. */
  connectors: Side[]
  /** Pick box half-width (x, z) and height, used for pointer hit tests. */
  pick: [number, number, number]
  /** Radius of the soft contact shadow; 0 for flat pieces. */
  blob: number
}

const track = (
  type: TrackType,
  label: string,
  connectors: Side[],
  height: number,
  blob = 0,
): CatalogItem => ({
  type,
  label,
  kind: 'track',
  size: 1,
  connectors,
  pick: [0.5, 0.5, height],
  blob,
})

const decoration = (
  type: DecorationType,
  label: string,
  halfX: number,
  halfZ: number,
  height: number,
  blob: number,
  size: 1 | 2 = 1,
): CatalogItem => ({
  type,
  label,
  kind: 'decoration',
  size,
  connectors: [],
  pick: [halfX, halfZ, height],
  blob,
})

export const CATALOG: Record<PieceType, CatalogItem> = {
  straight: track('straight', 'Straight track', ['N', 'S'], 0.1),
  curve: track('curve', 'Curved track', ['S', 'E'], 0.1),
  tunnel: track('tunnel', 'Tunnel', ['N', 'S'], 0.78, 0.72),
  station: track('station', 'Station', ['N', 'S'], 0.72, 0.7),
  buffer: track('buffer', 'Buffer stop', ['S'], 0.34, 0.3),
  house: decoration('house', 'Toy house', 0.4, 0.4, 1, 0.62),
  pineTree: decoration('pineTree', 'Pine tree', 0.36, 0.36, 1.2, 0.46),
  roundTree: decoration('roundTree', 'Round tree', 0.32, 0.32, 1, 0.4),
  hill: decoration('hill', 'Hill', 0.96, 0.96, 0.6, 1.15, 2),
  car: decoration('car', 'Toy car', 0.17, 0.27, 0.24, 0.3),
  cassette: decoration('cassette', 'Cassette tape', 0.34, 0.22, 0.08, 0.42),
  blocks: decoration('blocks', 'Building blocks', 0.34, 0.34, 0.66, 0.46),
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

export const isTrackType = (type: PieceType): type is TrackType => CATALOG[type].kind === 'track'
export const isPieceType = (value: unknown): value is PieceType =>
  typeof value === 'string' && Object.hasOwn(CATALOG, value)
