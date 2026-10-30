/**
 * Placement edge cases (Requirements 16.2, 16.3, 16.4, 16.5, 16.10, 16.12).
 *
 * Boards are built by hand so each case shows exactly which rule it exercises.
 * Expectations come from Requirement 16. A hill's footprint is its anchor tile
 * plus the tiles to the east, south and south-east.
 */
import { describe, expect, it } from 'vitest';
import {
  applyBuild,
  checkFootprint,
  type BuildContext,
  type BuildOutcome,
  type BuildRequest,
} from '@/domain/placement';
import type { Piece, PieceType, Rotation } from '@/domain/types';

function piece(id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece {
  return { id, type, gridX, gridZ, rotation };
}

function ctx(pieces: Piece[], mode: 'build' | 'play' = 'build'): BuildContext {
  let n = 0;
  return { pieces, mode, newId: () => `new-${++n}` };
}

function place(type: unknown, gridX: unknown, gridZ: unknown, rotation?: unknown): BuildRequest {
  return { kind: 'place', type, gridX, gridZ, rotation, autoAdjust: false };
}

function reasonOf(outcome: BuildOutcome): string | null {
  return outcome.ok ? null : outcome.reason;
}

/** Runs a request and checks that the input array was not touched. */
function run(pieces: Piece[], req: BuildRequest, mode: 'build' | 'play' = 'build'): BuildOutcome {
  const before = structuredClone(pieces);
  const outcome = applyBuild(ctx(pieces, mode), req);
  expect(pieces).toEqual(before);
  return outcome;
}

describe('out_of_bounds (16.3)', () => {
  it('rejects a hill anchored at gridX 15', () => {
    expect(reasonOf(run([], place('hill', 15, 3)))).toBe('out_of_bounds');
  });

  it('rejects a hill anchored at gridZ 15', () => {
    expect(reasonOf(run([], place('hill', 3, 15)))).toBe('out_of_bounds');
  });

  it('accepts a hill anchored at 14, 14 (footprint ends on tile 15)', () => {
    const outcome = run([], place('hill', 14, 14));
    expect(outcome.ok).toBe(true);
  });

  it('rejects negative, too large and non-integer coordinates', () => {
    expect(reasonOf(run([], place('straight', -1, 0)))).toBe('out_of_bounds');
    expect(reasonOf(run([], place('straight', 0, 16)))).toBe('out_of_bounds');
    expect(reasonOf(run([], place('straight', 1.5, 0)))).toBe('out_of_bounds');
    expect(reasonOf(run([], place('straight', 0, '2')))).toBe('out_of_bounds');
    expect(reasonOf(run([], place('straight', Number.NaN, 0)))).toBe('out_of_bounds');
  });

  it('rejects moving a hill so its footprint leaves the grid', () => {
    const pieces = [piece('h', 'hill', 13, 13)];
    const outcome = run(pieces, { kind: 'move', id: 'h', gridX: 15, gridZ: 13 });
    expect(reasonOf(outcome)).toBe('out_of_bounds');
  });
});

describe('moving onto own tiles (16.10)', () => {
  it('accepts a hill moved one tile east onto its own tiles', () => {
    const pieces = [piece('h', 'hill', 4, 4)];
    const outcome = run(pieces, { kind: 'move', id: 'h', gridX: 5, gridZ: 4 });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.pieces).toEqual([piece('h', 'hill', 5, 4)]);
  });

  it('accepts a hill moved one tile south-east onto its own tiles', () => {
    const pieces = [piece('h', 'hill', 4, 4)];
    expect(run(pieces, { kind: 'move', id: 'h', gridX: 5, gridZ: 5 }).ok).toBe(true);
  });

  it('still rejects a hill moved east onto a tile held by another piece', () => {
    const pieces = [piece('h', 'hill', 4, 4), piece('t', 'roundTree', 6, 5)];
    expect(reasonOf(run(pieces, { kind: 'move', id: 'h', gridX: 5, gridZ: 4 }))).toBe('occupied');
  });
});

describe('on_track and occupied (16.2, 16.4)', () => {
  it('rejects a decoration placed on a track tile with on_track', () => {
    const pieces = [piece('s', 'straight', 2, 2)];
    expect(reasonOf(run(pieces, place('house', 2, 2)))).toBe('on_track');
  });

  it('rejects a hill covering a track and a decoration with on_track', () => {
    // Hill at 2, 2 covers (2,2), (3,2), (2,3) and (3,3).
    const pieces = [piece('s', 'straight', 3, 2), piece('p', 'pineTree', 2, 3)];
    expect(reasonOf(run(pieces, place('hill', 2, 2)))).toBe('on_track');
  });

  it('rejects a decoration covering only a decoration with occupied', () => {
    const pieces = [piece('p', 'pineTree', 7, 7)];
    expect(reasonOf(run(pieces, place('car', 7, 7)))).toBe('occupied');
  });

  it('rejects a hill whose footprint covers only a decoration with occupied', () => {
    const pieces = [piece('b', 'blocks', 8, 9)];
    expect(reasonOf(run(pieces, place('hill', 7, 8)))).toBe('occupied');
  });

  it('rejects a track placed on a decoration with occupied', () => {
    const pieces = [piece('c', 'cassette', 5, 5)];
    expect(reasonOf(run(pieces, place('straight', 5, 5)))).toBe('occupied');
  });

  it('rejects a track placed on a hill tile other than its anchor with occupied', () => {
    const pieces = [piece('h', 'hill', 5, 5)];
    expect(reasonOf(run(pieces, place('curve', 6, 6)))).toBe('occupied');
  });

  it('rejects a track placed on a track with occupied', () => {
    const pieces = [piece('s', 'straight', 1, 1)];
    expect(reasonOf(run(pieces, place('tunnel', 1, 1)))).toBe('occupied');
  });

  it('rejects a decoration moved onto a track with on_track', () => {
    const pieces = [piece('s', 'straight', 1, 1), piece('r', 'roundTree', 4, 4)];
    expect(reasonOf(run(pieces, { kind: 'move', id: 'r', gridX: 1, gridZ: 1 }))).toBe('on_track');
  });

  it('rejects a track moved onto a decoration with occupied', () => {
    const pieces = [piece('s', 'straight', 1, 1), piece('r', 'roundTree', 4, 4)];
    expect(reasonOf(run(pieces, { kind: 'move', id: 's', gridX: 4, gridZ: 4 }))).toBe('occupied');
  });
});

describe('station_limit (16.5)', () => {
  it('rejects a second station', () => {
    const pieces = [piece('st', 'station', 0, 0)];
    expect(reasonOf(run(pieces, place('station', 10, 10)))).toBe('station_limit');
  });

  it('accepts moving the only station', () => {
    const pieces = [piece('st', 'station', 0, 0)];
    expect(run(pieces, { kind: 'move', id: 'st', gridX: 10, gridZ: 10 }).ok).toBe(true);
  });

  it('accepts a station once the previous one is gone', () => {
    expect(run([piece('s', 'straight', 0, 0)], place('station', 10, 10)).ok).toBe(true);
  });
});

describe('play_mode', () => {
  it('rejects rotate in Play mode', () => {
    const pieces = [piece('s', 'straight', 0, 0)];
    expect(reasonOf(run(pieces, { kind: 'rotate', id: 's' }, 'play'))).toBe('play_mode');
  });

  it('rejects every kind of request in Play mode, even otherwise valid ones', () => {
    const pieces = [piece('s', 'straight', 0, 0)];
    const requests: BuildRequest[] = [
      place('straight', 5, 5),
      { kind: 'move', id: 's', gridX: 5, gridZ: 5 },
      { kind: 'rotate', id: 's' },
      { kind: 'remove', id: 's' },
    ];
    for (const req of requests) expect(reasonOf(run(pieces, req, 'play'))).toBe('play_mode');
  });
});

describe('not_found', () => {
  const pieces = [piece('s', 'straight', 0, 0)];

  it('rejects move, rotate and remove with an unknown id', () => {
    expect(reasonOf(run(pieces, { kind: 'move', id: 'nope', gridX: 3, gridZ: 3 }))).toBe('not_found');
    expect(reasonOf(run(pieces, { kind: 'rotate', id: 'nope' }))).toBe('not_found');
    expect(reasonOf(run(pieces, { kind: 'remove', id: 'nope' }))).toBe('not_found');
  });

  it('rejects a non-string id', () => {
    expect(reasonOf(run(pieces, { kind: 'remove', id: 42 }))).toBe('not_found');
  });

  it('rejects an unknown piece type', () => {
    expect(reasonOf(run(pieces, place('rocket', 3, 3)))).toBe('not_found');
  });

  it('rejects a rotation that is not 0, 90, 180 or 270', () => {
    expect(reasonOf(run(pieces, place('straight', 3, 3, 45)))).toBe('not_found');
    expect(reasonOf(run(pieces, { kind: 'move', id: 's', gridX: 3, gridZ: 3, rotation: 360 }))).toBe(
      'not_found',
    );
  });
});

describe('precedence (16.12)', () => {
  it('play_mode beats not_found, out_of_bounds and the rest', () => {
    const pieces = [piece('st', 'station', 0, 0)];
    expect(reasonOf(run(pieces, place('rocket', -1, 0), 'play'))).toBe('play_mode');
    expect(reasonOf(run(pieces, place('station', 99, 0), 'play'))).toBe('play_mode');
    expect(reasonOf(run(pieces, { kind: 'move', id: 'nope', gridX: 99, gridZ: 0 }, 'play'))).toBe(
      'play_mode',
    );
  });

  it('not_found beats out_of_bounds', () => {
    expect(reasonOf(run([], place('rocket', 99, 99)))).toBe('not_found');
    expect(reasonOf(run([], { kind: 'move', id: 'nope', gridX: 99, gridZ: 99 }))).toBe('not_found');
    expect(reasonOf(run([], place('straight', 99, 99, 45)))).toBe('not_found');
  });

  it('out_of_bounds beats station_limit', () => {
    const pieces = [piece('st', 'station', 0, 0)];
    expect(reasonOf(run(pieces, place('station', 16, 0)))).toBe('out_of_bounds');
    expect(reasonOf(run(pieces, place('station', 2.5, 0)))).toBe('out_of_bounds');
  });

  it('station_limit beats occupied', () => {
    const pieces = [piece('st', 'station', 0, 0), piece('s', 'straight', 4, 4)];
    expect(reasonOf(run(pieces, place('station', 4, 4)))).toBe('station_limit');
    expect(reasonOf(run(pieces, place('station', 0, 0)))).toBe('station_limit');
  });

  it('on_track beats occupied', () => {
    const pieces = [piece('s', 'straight', 3, 3), piece('h', 'house', 4, 4)];
    expect(reasonOf(run(pieces, place('hill', 3, 3)))).toBe('on_track');
  });
});

describe('checkFootprint agrees with applyBuild (ghost tint, 11.5, 11.6)', () => {
  const pieces = [
    piece('st', 'station', 0, 0),
    piece('s', 'straight', 3, 3),
    piece('h', 'hill', 8, 8),
    piece('p', 'pineTree', 12, 2),
  ];

  const placements: Array<[PieceType, number, number]> = [
    ['hill', 15, 0],
    ['hill', 2, 2],
    ['hill', 7, 7],
    ['hill', 11, 1],
    ['house', 3, 3],
    ['straight', 9, 9],
    ['straight', 12, 2],
    ['station', 6, 6],
    ['curve', 6, 6],
    ['car', 14, 14],
  ];

  it.each(placements)('place %s at %i, %i', (type, x, z) => {
    const outcome = run(pieces, place(type, x, z));
    expect(checkFootprint(pieces, type, x, z)).toBe(reasonOf(outcome));
  });

  const moves: Array<[string, number, number]> = [
    ['h', 9, 8],
    ['h', 15, 8],
    ['h', 2, 2],
    ['p', 3, 3],
    ['p', 9, 9],
    ['s', 12, 2],
    ['st', 5, 5],
  ];

  it.each(moves)('move %s to %i, %i', (id, x, z) => {
    const mover = pieces.find((p) => p.id === id)!;
    const outcome = run(pieces, { kind: 'move', id, gridX: x, gridZ: z });
    expect(checkFootprint(pieces, mover.type, x, z, { movingId: id })).toBe(reasonOf(outcome));
  });
});
