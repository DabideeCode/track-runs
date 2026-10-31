import { describe, expect, it } from 'vitest';
import { validateMove, validatePlace, validateTarget } from '@/domain/rules';
import type { Piece } from '@/domain/types';

const track: Piece = { id: 't', type: 'straight', gridX: 2, gridZ: 2, rotation: 0 };
const house: Piece = { id: 'h', type: 'house', gridX: 4, gridZ: 2, rotation: 0 };
const hill: Piece = { id: 'k', type: 'hill', gridX: 8, gridZ: 8, rotation: 0 };
const station: Piece = { id: 's', type: 'station', gridX: 6, gridZ: 6, rotation: 0 };
const pieces = [track, house, hill];

describe('validatePlace', () => {
  it('allows a free tile', () => {
    expect(validatePlace(pieces, 'build', 'straight', 0, 0)).toBeNull();
  });

  it('reports play_mode first', () => {
    expect(validatePlace(pieces, 'play', 'straight', 99, 99)).toBe('play_mode');
  });

  it('reports out_of_bounds, including part of a hill', () => {
    expect(validatePlace(pieces, 'build', 'straight', 16, 0)).toBe('out_of_bounds');
    expect(validatePlace(pieces, 'build', 'straight', -1, 0)).toBe('out_of_bounds');
    expect(validatePlace(pieces, 'build', 'straight', 1.5, 0)).toBe('out_of_bounds');
    expect(validatePlace(pieces, 'build', 'hill', 15, 5)).toBe('out_of_bounds');
    expect(validatePlace(pieces, 'build', 'hill', 5, 15)).toBe('out_of_bounds');
  });

  it('prefers out_of_bounds over occupied', () => {
    expect(validatePlace([{ ...track, gridX: 15, gridZ: 5 }], 'build', 'hill', 15, 5)).toBe('out_of_bounds');
  });

  it('reports station_limit before tile rules', () => {
    expect(validatePlace([station], 'build', 'station', 0, 0)).toBe('station_limit');
    expect(validatePlace([station], 'build', 'station', 6, 6)).toBe('station_limit');
  });

  it('reports on_track for a decoration over any track tile', () => {
    expect(validatePlace(pieces, 'build', 'house', 2, 2)).toBe('on_track');
    expect(validatePlace(pieces, 'build', 'hill', 1, 1)).toBe('on_track');
  });

  it('reports on_track when a hill overlaps both a track and a decoration', () => {
    const mixed: Piece[] = [track, { ...house, gridX: 3, gridZ: 2 }];
    expect(validatePlace(mixed, 'build', 'hill', 2, 2)).toBe('on_track');
  });

  it('reports occupied for every other overlap', () => {
    expect(validatePlace(pieces, 'build', 'straight', 2, 2)).toBe('occupied');
    expect(validatePlace(pieces, 'build', 'straight', 4, 2)).toBe('occupied');
    expect(validatePlace(pieces, 'build', 'house', 4, 2)).toBe('occupied');
    expect(validatePlace(pieces, 'build', 'house', 9, 9)).toBe('occupied');
  });
});

describe('validateMove', () => {
  it('ignores the moving piece own tiles', () => {
    expect(validateMove(pieces, 'build', 'k', 9, 8)).toBeNull();
    expect(validateMove(pieces, 'build', 't', 2, 2)).toBeNull();
  });

  it('reports not_found, play_mode and tile rules', () => {
    expect(validateMove(pieces, 'build', 'nope', 0, 0)).toBe('not_found');
    expect(validateMove(pieces, 'play', 'nope', 0, 0)).toBe('play_mode');
    expect(validateMove(pieces, 'build', 'h', 2, 2)).toBe('on_track');
    expect(validateMove(pieces, 'build', 't', 4, 2)).toBe('occupied');
    expect(validateMove(pieces, 'build', 'k', 15, 8)).toBe('out_of_bounds');
  });

  it('lets a station move without tripping the station limit', () => {
    expect(validateMove([station], 'build', 's', 1, 1)).toBeNull();
  });
});

describe('validateTarget', () => {
  it('reports play_mode then not_found for rotate and remove', () => {
    expect(validateTarget(pieces, 'play', 'nope')).toBe('play_mode');
    expect(validateTarget(pieces, 'build', 'nope')).toBe('not_found');
    expect(validateTarget(pieces, 'build', 't')).toBeNull();
  });
});
