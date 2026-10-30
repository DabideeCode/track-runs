import {
  connectorsAt,
  DIRECTION_OFFSET,
  isTrack,
  oppositeDirection,
  type Direction,
} from './catalog';
import { tileToWorld } from './grid';
import type { Piece } from './types';

function trackTiles(pieces: readonly Piece[]) {
  const tracks = new Map<string, Piece>();
  for (const piece of pieces) {
    if (isTrack(piece.type)) tracks.set(`${piece.gridX},${piece.gridZ}`, piece);
  }
  return tracks;
}

export function connectedNeighbour(
  tracks: ReadonlyMap<string, Piece>,
  piece: Piece,
  direction: Direction,
): Piece | null {
  const offset = DIRECTION_OFFSET[direction];
  const neighbour = tracks.get(`${piece.gridX + offset.x},${piece.gridZ + offset.z}`);
  if (!neighbour) return null;
  const facing = oppositeDirection(direction);
  return connectorsAt(neighbour.type, neighbour.rotation).includes(facing) ? neighbour : null;
}

export { trackTiles };

export function getConnections(pieces: readonly Piece[]): Array<[string, string]> {
  const tracks = trackTiles(pieces);
  const order = new Map(pieces.map((piece, index) => [piece.id, index]));
  const pairs: Array<[string, string]> = [];
  for (const piece of pieces) {
    if (!isTrack(piece.type)) continue;
    for (const direction of connectorsAt(piece.type, piece.rotation)) {
      const neighbour = connectedNeighbour(tracks, piece, direction);
      if (neighbour && order.get(piece.id)! < order.get(neighbour.id)!) {
        pairs.push([piece.id, neighbour.id]);
      }
    }
  }
  return pairs;
}

export interface OpenEnd {
  pieceId: string;
  direction: Direction;
  x: number;
  z: number;
}

export function getOpenEnds(pieces: readonly Piece[]): OpenEnd[] {
  const tracks = trackTiles(pieces);
  const ends: OpenEnd[] = [];
  for (const piece of pieces) {
    if (!isTrack(piece.type)) continue;
    const centre = tileToWorld(piece.gridX, piece.gridZ);
    for (const direction of connectorsAt(piece.type, piece.rotation)) {
      if (connectedNeighbour(tracks, piece, direction)) continue;
      const offset = DIRECTION_OFFSET[direction];
      ends.push({
        pieceId: piece.id,
        direction,
        x: centre.x + offset.x * 0.42,
        z: centre.z + offset.z * 0.42,
      });
    }
  }
  return ends;
}

function connectionKey([a, b]: [string, string]) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function hasNewConnection(before: readonly Piece[], after: readonly Piece[]): boolean {
  const existing = new Set(getConnections(before).map(connectionKey));
  return getConnections(after).some((pair) => !existing.has(connectionKey(pair)));
}
