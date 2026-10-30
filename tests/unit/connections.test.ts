import { describe, expect, it } from 'vitest';
import { connectorsAt } from '@/domain/catalog';
import { getConnections, getOpenEnds, hasNewConnection } from '@/domain/connections';
import type { Piece, PieceType, Rotation } from '@/domain/types';

function piece(id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece {
  return { id, type, gridX, gridZ, rotation };
}

describe('connectorsAt', () => {
  it('rotates connectors clockwise', () => {
    expect(connectorsAt('straight', 90).sort()).toEqual(['E', 'W']);
    expect(connectorsAt('curve', 0).sort()).toEqual(['E', 'S']);
    expect(connectorsAt('curve', 90).sort()).toEqual(['S', 'W']);
    expect(connectorsAt('curve', 180).sort()).toEqual(['N', 'W']);
    expect(connectorsAt('curve', 270).sort()).toEqual(['E', 'N']);
    expect(connectorsAt('buffer', 0)).toEqual(['S']);
    expect(connectorsAt('buffer', 90)).toEqual(['W']);
    expect(connectorsAt('buffer', 180)).toEqual(['N']);
    expect(connectorsAt('buffer', 270)).toEqual(['E']);
    expect(connectorsAt('house', 90)).toEqual([]);
  });
});

describe('getConnections', () => {
  it('links adjacent tracks that share an edge connector', () => {
    const pieces = [piece('a', 'station', 8, 8), piece('b', 'straight', 8, 7)];
    expect(getConnections(pieces)).toEqual([['a', 'b']]);
  });

  it('lists each pair once in piece order', () => {
    const pieces = [piece('b', 'straight', 8, 7), piece('a', 'station', 8, 8)];
    expect(getConnections(pieces)).toEqual([['b', 'a']]);
  });

  it('needs a connector on both sides', () => {
    expect(getConnections([piece('a', 'straight', 8, 8), piece('b', 'straight', 9, 8)])).toEqual([]);
    expect(getConnections([piece('a', 'straight', 8, 8), piece('b', 'straight', 8, 7, 90)])).toEqual([]);
  });

  it('ignores decorations', () => {
    expect(getConnections([piece('a', 'straight', 8, 8), piece('b', 'house', 8, 7)])).toEqual([]);
  });
});

describe('getOpenEnds', () => {
  it('reports unconnected connectors, including at the grid edge and by decorations', () => {
    const pieces = [
      piece('a', 'straight', 0, 0),
      piece('b', 'straight', 0, 1),
      piece('c', 'house', 0, 2),
    ];
    expect(getOpenEnds(pieces).map((end) => `${end.pieceId}${end.direction}`).sort()).toEqual(['aN', 'bS']);
  });

  it('gives a buffer one open end only', () => {
    expect(getOpenEnds([piece('a', 'buffer', 4, 4)]).map((end) => end.direction)).toEqual(['S']);
  });
});

describe('hasNewConnection', () => {
  it('detects only connections that did not exist before', () => {
    const before = [piece('a', 'straight', 8, 8)];
    const after = [...before, piece('b', 'straight', 8, 7)];
    expect(hasNewConnection(before, after)).toBe(true);
    expect(hasNewConnection(after, after)).toBe(false);
  });
});
