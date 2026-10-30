/**
 * The 12-item catalogue from Section 6 of requirement.md, in table order.
 *
 * `connectors0` lists the connectors at rotation 0° in a fixed order. Index 0
 * is the progress-0 end of the piece's centreline and index 1 the progress-1
 * end (for the buffer stop, progress 1 is the stop block, which is not a
 * connector).
 */
import type { Dir, PieceType, Rotation, TrackType } from './types';

export interface CatalogueItem {
  type: PieceType;
  /** Exactly the Item column of Section 6, e.g. "Straight track". */
  label: string;
  kind: 'track' | 'decoration';
  /** Footprint edge length in tiles. */
  size: 1 | 2;
  /** Ordered connectors at 0°. */
  connectors0: readonly Dir[];
}

const N: Dir = 0;
const E: Dir = 1;
const S: Dir = 2;

export const CATALOGUE: readonly CatalogueItem[] = Object.freeze([
  { type: 'straight', label: 'Straight track', kind: 'track', size: 1, connectors0: [N, S] },
  { type: 'curve', label: 'Curved track', kind: 'track', size: 1, connectors0: [S, E] },
  { type: 'tunnel', label: 'Tunnel', kind: 'track', size: 1, connectors0: [N, S] },
  { type: 'station', label: 'Station', kind: 'track', size: 1, connectors0: [N, S] },
  { type: 'buffer', label: 'Buffer stop', kind: 'track', size: 1, connectors0: [S] },
  { type: 'house', label: 'Toy house', kind: 'decoration', size: 1, connectors0: [] },
  { type: 'pineTree', label: 'Pine tree', kind: 'decoration', size: 1, connectors0: [] },
  { type: 'roundTree', label: 'Round tree', kind: 'decoration', size: 1, connectors0: [] },
  { type: 'hill', label: 'Hill', kind: 'decoration', size: 2, connectors0: [] },
  { type: 'car', label: 'Toy car', kind: 'decoration', size: 1, connectors0: [] },
  { type: 'cassette', label: 'Cassette tape', kind: 'decoration', size: 1, connectors0: [] },
  { type: 'blocks', label: 'Building blocks', kind: 'decoration', size: 1, connectors0: [] },
].map((item) => Object.freeze({ ...item, connectors0: Object.freeze(item.connectors0) })) as CatalogueItem[]);

const BY_TYPE: ReadonlyMap<string, CatalogueItem> = new Map(
  CATALOGUE.map((item) => [item.type, item]),
);

/** The catalogue entry for a piece type. */
export function itemOf(type: PieceType): CatalogueItem {
  const item = BY_TYPE.get(type);
  if (!item) throw new Error(`Unknown piece type: ${String(type)}`);
  return item;
}

/** True when `x` is one of the 12 type ids. */
export function isPieceType(x: unknown): x is PieceType {
  return typeof x === 'string' && BY_TYPE.has(x);
}

/** True for the 5 track types. */
export function isTrackType(t: PieceType): t is TrackType {
  return BY_TYPE.get(t)?.kind === 'track';
}

/** True when `x` is exactly 0, 90, 180 or 270. */
export function isRotation(x: unknown): x is Rotation {
  return x === 0 || x === 90 || x === 180 || x === 270;
}
