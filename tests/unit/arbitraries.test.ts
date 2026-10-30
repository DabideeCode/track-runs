/**
 * Self-checks for the shared generators in `tests/unit/arbitraries.ts`.
 *
 * Board invariants are checked with footprints computed here, not with the
 * grid helpers. Loop closure uses `openEnds` and `getConnections`.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild } from '@/domain/placement';
import { getConnections, openEnds } from '@/domain/connections';
import type { Piece } from '@/domain/types';
import {
  DECORATION_TYPES,
  ID_GEN,
  ROTATIONS,
  TRACK_TYPES,
  arbBoard,
  arbBoardAndRequest,
  arbBoardWithHistory,
  arbLayout,
  arbLayoutWith,
  arbLoop,
} from './arbitraries';

function tilesOf(p: Piece): string[] {
  const size = p.type === 'hill' ? 2 : 1;
  const out: string[] = [];
  for (let dx = 0; dx < size; dx++) {
    for (let dz = 0; dz < size; dz++) out.push(`${p.gridX + dx},${p.gridZ + dz}`);
  }
  return out;
}

function expectBoardInvariants(pieces: readonly Piece[]): void {
  const ids = new Set(pieces.map((p) => p.id));
  expect(ids.size).toBe(pieces.length);
  const used = new Set<string>();
  for (const p of pieces) {
    expect([...TRACK_TYPES, ...DECORATION_TYPES]).toContain(p.type);
    expect(ROTATIONS).toContain(p.rotation);
    expect(Number.isInteger(p.gridX) && Number.isInteger(p.gridZ)).toBe(true);
    const size = p.type === 'hill' ? 2 : 1;
    expect(p.gridX >= 0 && p.gridX + size <= 16).toBe(true);
    expect(p.gridZ >= 0 && p.gridZ + size <= 16).toBe(true);
    for (const t of tilesOf(p)) {
      expect(used.has(t)).toBe(false);
      used.add(t);
    }
  }
  expect(pieces.filter((p) => p.type === 'station').length).toBeLessThanOrEqual(1);
}

describe('ID_GEN', () => {
  it('counts up from the start value with the prefix', () => {
    const gen = ID_GEN('q', 5);
    expect([gen(), gen(), gen()]).toEqual(['q5', 'q6', 'q7']);
    expect(ID_GEN()()).toBe('p1');
  });
});

describe('arbBoard', () => {
  it('satisfies the board invariants', () => {
    fc.assert(fc.property(arbBoard, (pieces) => expectBoardInvariants(pieces)), { numRuns: 200 });
  });

  it('replays to the same board from its recorded steps', () => {
    fc.assert(
      fc.property(arbBoardWithHistory(), ({ pieces, steps, nextIdStart }) => {
        const newId = ID_GEN();
        let replay: Piece[] = [];
        for (const { request } of steps) {
          const out = applyBuild({ pieces: replay, mode: 'build', newId }, request);
          expect(out.ok).toBe(true);
          if (out.ok) replay = out.pieces;
        }
        expect(replay).toEqual(pieces);
        expect(newId()).toBe(`p${nextIdStart}`);
      }),
      { numRuns: 100 },
    );
  });

  it('often produces connections', () => {
    const boards = fc.sample(arbBoard, { numRuns: 200, seed: 42 });
    expect(boards.filter((b) => getConnections(b).length > 0).length).toBeGreaterThan(80);
  });
});

describe('arbRequest', () => {
  it('covers every kind, accepted requests and every rejection reason', () => {
    const samples = fc.sample(arbBoardAndRequest, { numRuns: 3000, seed: 7 });
    const kinds = new Set<string>();
    const results = new Set<string>();
    for (const { pieces, request } of samples) {
      kinds.add(request.kind);
      const out = applyBuild({ pieces, mode: 'build', newId: ID_GEN('n') }, request);
      results.add(out.ok ? 'ok' : out.reason);
    }
    expect([...kinds].sort()).toEqual(['move', 'place', 'remove', 'rotate']);
    for (const r of ['ok', 'not_found', 'out_of_bounds', 'station_limit', 'on_track', 'occupied']) {
      expect(results).toContain(r);
    }
  });
});

describe('arbLayout', () => {
  it('has exactly one station and only tracks', () => {
    fc.assert(
      fc.property(arbLayout, (pieces) => {
        expectBoardInvariants(pieces);
        expect(pieces.filter((p) => p.type === 'station')).toHaveLength(1);
        for (const p of pieces) expect(TRACK_TYPES).toContain(p.type);
      }),
      { numRuns: 100 },
    );
  });

  it('allows decorations when asked and keeps one station', () => {
    fc.assert(
      fc.property(arbLayoutWith({ decorations: true }), (pieces) => {
        expectBoardInvariants(pieces);
        expect(pieces.filter((p) => p.type === 'station')).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });
});

describe('arbLoop', () => {
  it('is closed: no open ends and every piece has exactly 2 connections', () => {
    fc.assert(
      fc.property(arbLoop(), (loop) => {
        const { pieces, straightsX, straightsZ } = loop;
        expectBoardInvariants(pieces);
        expect(pieces).toHaveLength(4 + 2 * (straightsX + straightsZ));
        expect(pieces.filter((p) => p.type === 'curve')).toHaveLength(4);
        expect(openEnds(pieces)).toEqual([]);
        const connections = getConnections(pieces);
        expect(connections).toHaveLength(pieces.length);
        const count = new Map<string, number>();
        for (const [a, b] of connections) {
          count.set(a, (count.get(a) ?? 0) + 1);
          count.set(b, (count.get(b) ?? 0) + 1);
        }
        for (const p of pieces) expect(count.get(p.id)).toBe(2);
        expect(loop.length).toBeCloseTo(Math.PI + 2 * (straightsX + straightsZ));
      }),
      { numRuns: 200 },
    );
  });

  it('honours the station option', () => {
    fc.assert(
      fc.property(arbLoop({ station: 'always' }), (loop) => {
        const stations = loop.pieces.filter((p) => p.type === 'station');
        expect(stations).toHaveLength(1);
        expect(loop.stationId).toBe(stations[0]!.id);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(arbLoop({ station: 'never', tunnels: false }), (loop) => {
        expect(loop.stationId).toBeNull();
        for (const p of loop.pieces) expect(['curve', 'straight']).toContain(p.type);
      }),
      { numRuns: 100 },
    );
  });

  it('includes the 2 × 2 loop of four curves', () => {
    const loops = fc.sample(arbLoop({ maxStraights: 0 }), { numRuns: 20, seed: 1 });
    for (const loop of loops) {
      expect(loop.pieces.map((p) => [p.type, p.rotation])).toEqual([
        ['curve', 0],
        ['curve', 90],
        ['curve', 180],
        ['curve', 270],
      ]);
    }
  });
});
