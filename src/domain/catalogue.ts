import type { DecorationType, PieceType, Rotation, TrackType } from './types';

export type Edge = 'N' | 'E' | 'S' | 'W';

export interface CatalogueItem {
  type: PieceType;
  name: string;
  kind: 'track' | 'decoration';
  footprint: readonly [number, number];
  connectors: readonly Edge[];
  height: number;
}

export const TRACK_TYPES: readonly TrackType[] = ['straight', 'curve', 'tunnel', 'station', 'buffer'];
export const DECORATION_TYPES: readonly DecorationType[] = [
  'house',
  'pineTree',
  'roundTree',
  'hill',
  'car',
  'cassette',
  'blocks',
];

export const CATALOGUE: Record<PieceType, CatalogueItem> = {
  straight: { type: 'straight', name: 'Straight track', kind: 'track', footprint: [1, 1], connectors: ['N', 'S'], height: 0.12 },
  curve: { type: 'curve', name: 'Curved track', kind: 'track', footprint: [1, 1], connectors: ['S', 'E'], height: 0.12 },
  tunnel: { type: 'tunnel', name: 'Tunnel', kind: 'track', footprint: [1, 1], connectors: ['N', 'S'], height: 0.85 },
  station: { type: 'station', name: 'Station', kind: 'track', footprint: [1, 1], connectors: ['N', 'S'], height: 0.85 },
  buffer: { type: 'buffer', name: 'Buffer stop', kind: 'track', footprint: [1, 1], connectors: ['S'], height: 0.35 },
  house: { type: 'house', name: 'Toy house', kind: 'decoration', footprint: [1, 1], connectors: [], height: 1 },
  pineTree: { type: 'pineTree', name: 'Pine tree', kind: 'decoration', footprint: [1, 1], connectors: [], height: 1.2 },
  roundTree: { type: 'roundTree', name: 'Round tree', kind: 'decoration', footprint: [1, 1], connectors: [], height: 1 },
  hill: { type: 'hill', name: 'Hill', kind: 'decoration', footprint: [2, 2], connectors: [], height: 0.6 },
  car: { type: 'car', name: 'Toy car', kind: 'decoration', footprint: [1, 1], connectors: [], height: 0.25 },
  cassette: { type: 'cassette', name: 'Cassette tape', kind: 'decoration', footprint: [1, 1], connectors: [], height: 0.1 },
  blocks: { type: 'blocks', name: 'Building blocks', kind: 'decoration', footprint: [1, 1], connectors: [], height: 0.6 },
};

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export function isPieceType(value: unknown): value is PieceType {
  return typeof value === 'string' && Object.hasOwn(CATALOGUE, value);
}

export function isTrack(type: PieceType): type is TrackType {
  return CATALOGUE[type].kind === 'track';
}

export function isRotation(value: unknown): value is Rotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}
