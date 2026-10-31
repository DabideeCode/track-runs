import { CATALOGUE, type Edge } from './catalogue';
import { buildOccupancy, tileKey } from './grid';
import type { Piece, PieceType, Rotation } from './types';

const CLOCKWISE: readonly Edge[] = ['N', 'E', 'S', 'W'];

export const OPPOSITE: Record<Edge, Edge> = { N: 'S', E: 'W', S: 'N', W: 'E' };

export const EDGE_DELTA: Record<Edge, { x: number; z: number }> = {
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
};

export function rotateEdge(edge: Edge, rotation: Rotation): Edge {
  return CLOCKWISE[(CLOCKWISE.indexOf(edge) + rotation / 90) % 4]!;
}

export function connectorsFor(type: PieceType, rotation: Rotation): Edge[] {
  return CATALOGUE[type].connectors.map((edge) => rotateEdge(edge, rotation));
}

export function pieceConnectors(piece: Piece): Edge[] {
  return connectorsFor(piece.type, piece.rotation);
}

/** The track joined to this piece through one of its connectors, if any. */
export function connectedNeighbour(
  piece: Pick<Piece, 'gridX' | 'gridZ'>,
  edge: Edge,
  occupancy: Map<string, Piece>,
): Piece | null {
  const delta = EDGE_DELTA[edge];
  const neighbour = occupancy.get(tileKey(piece.gridX + delta.x, piece.gridZ + delta.z));
  if (!neighbour || !pieceConnectors(neighbour).includes(OPPOSITE[edge])) return null;
  return neighbour;
}

export function getConnections(pieces: readonly Piece[]): Array<[string, string]> {
  const occupancy = buildOccupancy(pieces);
  const pairs: Array<[string, string]> = [];
  for (const piece of pieces) {
    for (const edge of pieceConnectors(piece)) {
      // Each shared edge is seen from both sides, so count it from the north or east side only.
      if (edge !== 'N' && edge !== 'E') continue;
      const neighbour = connectedNeighbour(piece, edge, occupancy);
      if (neighbour) pairs.push([piece.id, neighbour.id].sort() as [string, string]);
    }
  }
  return pairs;
}

export interface OpenEnd {
  pieceId: string;
  edge: Edge;
  gridX: number;
  gridZ: number;
}

export function getOpenEnds(pieces: readonly Piece[]): OpenEnd[] {
  const occupancy = buildOccupancy(pieces);
  const ends: OpenEnd[] = [];
  for (const piece of pieces) {
    for (const edge of pieceConnectors(piece)) {
      if (!connectedNeighbour(piece, edge, occupancy)) {
        ends.push({ pieceId: piece.id, edge, gridX: piece.gridX, gridZ: piece.gridZ });
      }
    }
  }
  return ends;
}
