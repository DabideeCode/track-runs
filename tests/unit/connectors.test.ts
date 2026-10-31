import { describe, expect, it } from 'vitest';
import { getConnections, getOpenEnds, pieceConnectors, rotateEdge } from '@/domain/connectors';
import type { Piece, PieceType, Rotation } from '@/domain/types';

const piece = (id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id,
  type,
  gridX,
  gridZ,
  rotation,
});

describe('rotateEdge', () => {
  it('moves clockwise: a north connector goes east after one rotation', () => {
    expect(rotateEdge('N', 90)).toBe('E');
    expect(rotateEdge('N', 180)).toBe('S');
    expect(rotateEdge('N', 270)).toBe('W');
    expect(rotateEdge('W', 90)).toBe('N');
  });
});

describe('pieceConnectors', () => {
  it.each([
    ['straight', 0, ['N', 'S']],
    ['straight', 90, ['E', 'W']],
    ['curve', 0, ['S', 'E']],
    ['curve', 90, ['W', 'S']],
    ['curve', 180, ['N', 'W']],
    ['curve', 270, ['E', 'N']],
    ['tunnel', 90, ['E', 'W']],
    ['station', 180, ['S', 'N']],
    ['buffer', 0, ['S']],
    ['buffer', 90, ['W']],
    ['buffer', 180, ['N']],
    ['buffer', 270, ['E']],
    ['house', 0, []],
    ['hill', 90, []],
  ] as const)('%s at %d', (type, rotation, expected) => {
    expect(pieceConnectors(piece('a', type, 3, 3, rotation))).toEqual(expected);
  });
});

describe('getConnections', () => {
  it('connects adjacent tracks that both have a connector on the shared edge', () => {
    const a = piece('a', 'straight', 5, 5);
    const b = piece('b', 'straight', 5, 4);
    expect(getConnections([a, b])).toEqual([['a', 'b']]);
  });

  it('lists each pair once', () => {
    const line = [piece('a', 'straight', 5, 5), piece('b', 'straight', 5, 4), piece('c', 'straight', 5, 3)];
    expect(getConnections(line)).toHaveLength(2);
  });

  it('does not connect when one side has no connector there', () => {
    expect(getConnections([piece('a', 'straight', 5, 5), piece('b', 'straight', 5, 4, 90)])).toEqual([]);
    expect(getConnections([piece('a', 'straight', 5, 5), piece('b', 'straight', 6, 5)])).toEqual([]);
  });

  it('does not connect to the blocked side of a buffer', () => {
    expect(getConnections([piece('a', 'straight', 5, 5), piece('b', 'buffer', 5, 6)])).toEqual([]);
    expect(getConnections([piece('a', 'straight', 5, 5), piece('b', 'buffer', 5, 4)])).toEqual([['a', 'b']]);
  });

  it('ignores decorations', () => {
    expect(getConnections([piece('a', 'straight', 5, 5), piece('b', 'house', 5, 4)])).toEqual([]);
  });

  it('closes a loop of four curves', () => {
    const loop = [
      piece('a', 'curve', 5, 5, 0),
      piece('b', 'curve', 6, 5, 90),
      piece('c', 'curve', 6, 6, 180),
      piece('d', 'curve', 5, 6, 270),
    ];
    expect(getConnections(loop)).toHaveLength(4);
    expect(getOpenEnds(loop)).toEqual([]);
  });
});

describe('getOpenEnds', () => {
  it('reports each connector with no connected neighbour', () => {
    const ends = getOpenEnds([piece('a', 'straight', 5, 5), piece('b', 'straight', 5, 4)]);
    expect(ends.map((end) => [end.pieceId, end.edge]).sort()).toEqual([
      ['a', 'S'],
      ['b', 'N'],
    ]);
  });

  it('a buffer has no open end once connected', () => {
    const ends = getOpenEnds([piece('a', 'buffer', 5, 5), piece('b', 'straight', 5, 6)]);
    expect(ends.map((end) => end.pieceId)).toEqual(['b']);
  });

  it('reports open ends at the grid edge', () => {
    expect(getOpenEnds([piece('a', 'straight', 0, 0)])).toHaveLength(2);
  });
});
