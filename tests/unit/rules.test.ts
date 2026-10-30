import { describe, expect, it } from 'vitest';
import { validatePlacement } from '@/domain/rules';
import type { Piece, PieceType } from '@/domain/types';

function piece(id: string, type: PieceType, gridX: number, gridZ: number): Piece {
  return { id, type, gridX, gridZ, rotation: 0 };
}

const check = (pieces: Piece[], type: PieceType, gridX: number, gridZ: number, movingId?: string) =>
  validatePlacement(pieces, { mode: 'build', type, gridX, gridZ, movingId });

describe('validatePlacement', () => {
  it('accepts a free tile', () => {
    expect(check([], 'straight', 0, 0)).toBeNull();
    expect(check([], 'hill', 14, 14)).toBeNull();
  });

  it('reports play_mode first', () => {
    const reason = validatePlacement([], { mode: 'play', type: 'house', gridX: 99, gridZ: 0 });
    expect(reason).toBe('play_mode');
  });

  it('reports not_found for an unknown piece or type', () => {
    expect(check([], 'straight', 1, 1, 'missing')).toBe('not_found');
    expect(check([], 'rocket' as PieceType, 1, 1)).toBe('not_found');
  });

  it('reports out_of_bounds off the grid or on fractional tiles', () => {
    expect(check([], 'straight', 16, 0)).toBe('out_of_bounds');
    expect(check([], 'straight', -1, 0)).toBe('out_of_bounds');
    expect(check([], 'straight', 1.5, 0)).toBe('out_of_bounds');
  });

  it('keeps the hill inside the east and south edges', () => {
    expect(check([], 'hill', 15, 0)).toBe('out_of_bounds');
    expect(check([], 'hill', 0, 15)).toBe('out_of_bounds');
  });

  it('allows one station', () => {
    const pieces = [piece('a', 'station', 3, 3)];
    expect(check(pieces, 'station', 5, 5)).toBe('station_limit');
    expect(check(pieces, 'station', 5, 5, 'a')).toBeNull();
  });

  it('prefers station_limit over occupied', () => {
    expect(check([piece('a', 'station', 3, 3)], 'station', 3, 3)).toBe('station_limit');
  });

  it('reports on_track for a decoration on a track', () => {
    expect(check([piece('a', 'straight', 3, 3)], 'house', 3, 3)).toBe('on_track');
    expect(check([piece('a', 'straight', 4, 4)], 'hill', 3, 3)).toBe('on_track');
  });

  it('reports occupied otherwise', () => {
    expect(check([piece('a', 'straight', 3, 3)], 'curve', 3, 3)).toBe('occupied');
    expect(check([piece('a', 'house', 3, 3)], 'straight', 3, 3)).toBe('occupied');
    expect(check([piece('a', 'hill', 3, 3)], 'car', 4, 4)).toBe('occupied');
  });

  it('never lets a piece block itself', () => {
    const pieces = [piece('a', 'hill', 3, 3)];
    expect(check(pieces, 'hill', 4, 3, 'a')).toBeNull();
    expect(check(pieces, 'hill', 3, 3, 'a')).toBeNull();
  });
});
