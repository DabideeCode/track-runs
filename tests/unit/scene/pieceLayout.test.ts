/**
 * Unit tests for `src/scene/pieces/pieceLayout.ts`: which pieces the
 * instanced layers draw, rest transforms, hover and cursor rules, and
 * open-end marker positions.
 *
 * Requirements: 14.1, 14.6, 28.17, 28.19, 31.9
 */
import { describe, expect, it } from 'vitest';
import { openEnds } from '@/domain/connections';
import type { Piece, Rotation } from '@/domain/types';
import {
  MAX_OPEN_ENDS,
  MAX_PIECES,
  OPEN_END_PEG,
  activePieceIds,
  cursorFor,
  isActivePiece,
  isHoverLifted,
  newlyAddedIds,
  openEndMarkerPositions,
  pieceRestTransform,
  staticPieces,
} from '@/scene/pieces/pieceLayout';

const piece = (id: string, type: Piece['type'], gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id,
  type,
  gridX,
  gridZ,
  rotation,
});

const board: Piece[] = [
  piece('a', 'straight', 3, 3),
  piece('b', 'house', 5, 5),
  piece('c', 'hill', 8, 8, 90),
];

describe('active and static pieces', () => {
  it('draws every piece statically when nothing is selected or dragged', () => {
    const sel = { selectedPieceId: null, drag: null };
    expect(staticPieces(board, sel)).toBe(board);
    expect(activePieceIds(board, sel)).toEqual([]);
  });

  it('leaves out the selected piece and keeps store order', () => {
    const sel = { selectedPieceId: 'b', drag: null };
    expect(staticPieces(board, sel).map((p) => p.id)).toEqual(['a', 'c']);
    expect(activePieceIds(board, sel)).toEqual(['b']);
  });

  it('leaves out the board-dragged piece as well as the selected one', () => {
    const sel = { selectedPieceId: 'a', drag: { pieceId: 'c' } };
    expect(isActivePiece('c', sel)).toBe(true);
    expect(staticPieces(board, sel).map((p) => p.id)).toEqual(['b']);
    expect(activePieceIds(board, sel)).toEqual(['a', 'c']);
  });

  it('treats a palette drag (no piece id) as no active piece', () => {
    const sel = { selectedPieceId: null, drag: { pieceId: null } };
    expect(staticPieces(board, sel)).toBe(board);
  });

  it('draws each piece exactly once across the static and active sets', () => {
    const sel = { selectedPieceId: 'a', drag: { pieceId: 'b' } };
    const ids = [...staticPieces(board, sel).map((p) => p.id), ...activePieceIds(board, sel)].sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('pieceRestTransform', () => {
  it('puts a 1 × 1 piece at the tile centre (Requirement 14.1)', () => {
    for (const [gx, gz] of [
      [0, 0],
      [15, 15],
      [7, 3],
    ] as const) {
      const t = pieceRestTransform(piece('p', 'straight', gx, gz));
      expect(t.x).toBe(gx - 7.5);
      expect(t.z).toBe(gz - 7.5);
    }
  });

  it('puts a hill at the centre of its 2 × 2 footprint for every rotation (Requirement 28.17)', () => {
    for (const r of [0, 90, 180, 270] as const) {
      const t = pieceRestTransform(piece('h', 'hill', 4, 6, r));
      expect(t.x).toBe(4 - 7);
      expect(t.z).toBe(6 - 7);
    }
  });

  it('turns clockwise from above: rotation.y = −rotation × π / 180 (Requirement 28.19)', () => {
    for (const r of [0, 90, 180, 270] as const) {
      const t = pieceRestTransform(piece('p', 'curve', 1, 1, r));
      expect(t.yawDeg).toBe(r === 0 ? 0 : -r);
      expect(t.yaw).toBeCloseTo((-r * Math.PI) / 180, 12);
    }
  });
});

describe('hover and cursor (Requirement 31.9)', () => {
  it('lifts and shows a pointer only for the hovered piece in Build mode with no drag', () => {
    const s = { mode: 'build' as const, drag: null, hoverPieceId: 'a' };
    expect(isHoverLifted('a', s)).toBe(true);
    expect(isHoverLifted('b', s)).toBe(false);
    expect(cursorFor(s)).toBe('pointer');
  });

  it('restores the default with no hovered piece, during a drag and in Play mode', () => {
    expect(cursorFor({ mode: 'build', drag: null, hoverPieceId: null })).toBe('');
    expect(cursorFor({ mode: 'build', drag: {}, hoverPieceId: 'a' })).toBe('');
    expect(isHoverLifted('a', { mode: 'build', drag: {}, hoverPieceId: 'a' })).toBe(false);
    expect(cursorFor({ mode: 'play', drag: null, hoverPieceId: 'a' })).toBe('');
    expect(isHoverLifted('a', { mode: 'play', drag: null, hoverPieceId: 'a' })).toBe(false);
  });
});

describe('newlyAddedIds', () => {
  it('reports nothing on the first render', () => {
    expect(newlyAddedIds(null, board).size).toBe(0);
  });

  it('reports exactly the ids not seen before', () => {
    const before = new Set(['a', 'b']);
    expect([...newlyAddedIds(before, board)]).toEqual(['c']);
    expect(newlyAddedIds(new Set(['a', 'b', 'c']), board).size).toBe(0);
  });
});

describe('openEndMarkerPositions (Requirement 14.6)', () => {
  it('puts a lone straight track’s markers at its north and south edge midpoints', () => {
    const pieces = [piece('s', 'straight', 2, 4)];
    const positions = openEndMarkerPositions(openEnds(pieces));
    expect(positions).toHaveLength(2);
    const zs = positions.map((p) => p.z).sort((a, b) => a - b);
    expect(zs).toEqual([4 - 8, 4 - 7]);
    for (const p of positions) expect(p.x).toBe(2 - 7.5);
  });

  it('shows markers on boundary-facing connectors and none on connected ones', () => {
    const pieces = [piece('n', 'straight', 0, 0), piece('m', 'straight', 0, 1)];
    const positions = openEndMarkerPositions(openEnds(pieces));
    // Connected edge between the two tiles (z = −7) has no marker.
    expect(positions.map((p) => p.z).sort((a, b) => a - b)).toEqual([-8, -6]);
  });

  it('places a buffer marker only on its open south end', () => {
    const positions = openEndMarkerPositions(openEnds([piece('b', 'buffer', 5, 5, 0)]));
    expect(positions).toEqual([{ pieceId: 'b', x: 5 - 7.5, z: 5 - 7 }]);
  });

  it('hides the markers of the piece being dragged', () => {
    const pieces = [piece('a', 'straight', 0, 0), piece('b', 'curve', 6, 6, 90)];
    const positions = openEndMarkerPositions(openEnds(pieces), 'b');
    expect(positions.every((p) => p.pieceId === 'a')).toBe(true);
    expect(positions).toHaveLength(2);
  });

  it('keeps pegs no wider than 0.25 tiles and sizes buffers for a full board', () => {
    expect(OPEN_END_PEG.width).toBeLessThanOrEqual(0.25);
    expect(MAX_PIECES).toBe(256);
    expect(MAX_OPEN_ENDS).toBe(512);
  });
});
