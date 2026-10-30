import type { PieceType, Rotation, TrackType } from './types';

export type Direction = 'N' | 'E' | 'S' | 'W';
export type PieceKind = 'track' | 'decoration';

export interface CatalogItem {
  type: PieceType;
  name: string;
  kind: PieceKind;
  footprint: 1 | 2;
  connectors: readonly Direction[];
  pickHeight: number;
}

export const CATALOG: readonly CatalogItem[] = [
  { type: 'straight', name: 'Straight track', kind: 'track', footprint: 1, connectors: ['N', 'S'], pickHeight: 0.12 },
  { type: 'curve', name: 'Curved track', kind: 'track', footprint: 1, connectors: ['S', 'E'], pickHeight: 0.12 },
  { type: 'tunnel', name: 'Tunnel', kind: 'track', footprint: 1, connectors: ['N', 'S'], pickHeight: 0.75 },
  { type: 'station', name: 'Station', kind: 'track', footprint: 1, connectors: ['N', 'S'], pickHeight: 0.75 },
  { type: 'buffer', name: 'Buffer stop', kind: 'track', footprint: 1, connectors: ['S'], pickHeight: 0.35 },
  { type: 'house', name: 'Toy house', kind: 'decoration', footprint: 1, connectors: [], pickHeight: 1 },
  { type: 'pineTree', name: 'Pine tree', kind: 'decoration', footprint: 1, connectors: [], pickHeight: 1.2 },
  { type: 'roundTree', name: 'Round tree', kind: 'decoration', footprint: 1, connectors: [], pickHeight: 1 },
  { type: 'hill', name: 'Hill', kind: 'decoration', footprint: 2, connectors: [], pickHeight: 0.6 },
  { type: 'car', name: 'Toy car', kind: 'decoration', footprint: 1, connectors: [], pickHeight: 0.3 },
  { type: 'cassette', name: 'Cassette tape', kind: 'decoration', footprint: 1, connectors: [], pickHeight: 0.08 },
  { type: 'blocks', name: 'Building blocks', kind: 'decoration', footprint: 1, connectors: [], pickHeight: 0.6 },
];

const ITEMS = new Map(CATALOG.map((item) => [item.type, item]));
const CLOCKWISE: readonly Direction[] = ['N', 'E', 'S', 'W'];

export const DIRECTION_OFFSET: Record<Direction, { x: number; z: number }> = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
};

export function isPieceType(type: string): type is PieceType {
  return ITEMS.has(type as PieceType);
}

export function catalogItem(type: PieceType): CatalogItem {
  return ITEMS.get(type)!;
}

export function isTrack(type: PieceType): type is TrackType {
  return catalogItem(type).kind === 'track';
}

export function rotateDirection(direction: Direction, rotation: Rotation): Direction {
  const steps = rotation / 90;
  return CLOCKWISE[(CLOCKWISE.indexOf(direction) + steps) % 4]!;
}

export function oppositeDirection(direction: Direction): Direction {
  return rotateDirection(direction, 180);
}

export function connectorsAt(type: PieceType, rotation: Rotation): Direction[] {
  return catalogItem(type).connectors.map((direction) => rotateDirection(direction, rotation));
}

export function footprintTiles(type: PieceType, gridX: number, gridZ: number) {
  const size = catalogItem(type).footprint;
  const tiles: Array<{ x: number; z: number }> = [];
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      tiles.push({ x: gridX + x, z: gridZ + z });
    }
  }
  return tiles;
}

export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}
