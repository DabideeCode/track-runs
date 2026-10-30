// Feature: track-diorama-builder, Property 13: Rotation choice for new placements
/**
 * **Validates: Requirements 15.1, 15.2, 15.4, 15.5, 15.6, 39.18**
 *
 * For any board, track type, free target tile and starting rotation r, the
 * stored rotation of the new piece equals: r when auto-adjust is off (the hook
 * was given a rotation); otherwise r if r already connects or no neighbour has
 * a connector facing the tile; otherwise the first of r + 90, r + 180, r + 270
 * (mod 360) that creates a connection; otherwise r. A hook call without a
 * rotation uses r = 0. Decorations always keep r.
 *
 * The oracle is written from Requirement 15 and Requirement 28 only. It does
 * not import the catalogue, connectors, grid, occupancy or connections
 * modules: connectors, rotation, footprints and occupancy are restated here.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { resolveAutoRotation } from '@/domain/autoAdjust';
import { openEnds } from '@/domain/connections';
import { applyBuild, type BuildRequest } from '@/domain/placement';
import type { Piece, PieceType, Rotation } from '@/domain/types';
import { DECORATION_TYPES, ROTATIONS, TRACK_TYPES, arbBoard, arbLayoutWith } from '../arbitraries';

// ---------------------------------------------------------------------------
// Independent reference oracle
// ---------------------------------------------------------------------------

type OracleDir = 'N' | 'E' | 'S' | 'W';
const CLOCKWISE: readonly OracleDir[] = ['N', 'E', 'S', 'W'];
const DELTA: Record<OracleDir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPPOSITE: Record<OracleDir, OracleDir> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** Requirement 28: track connectors at 0°. Decorations have none. */
const CONNECTORS_AT_0: Record<string, readonly OracleDir[]> = {
  straight: ['N', 'S'],
  tunnel: ['N', 'S'],
  station: ['N', 'S'],
  curve: ['S', 'E'],
  buffer: ['S'],
};

const isTrack = (type: string) => type in CONNECTORS_AT_0;

/** Connectors turned clockwise by `rotation` (N → E → S → W per 90°). */
function oracleConnectors(type: string, rotation: number): OracleDir[] {
  const base = CONNECTORS_AT_0[type] ?? [];
  const steps = rotation / 90;
  return base.map((d) => CLOCKWISE[(CLOCKWISE.indexOf(d) + steps) % 4]!);
}

function oracleFootprint(type: string, x: number, z: number): Array<[number, number]> {
  return type === 'hill' ? [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]] : [[x, z]];
}

const key = (x: number, z: number) => `${x},${z}`;

function oracleOccupancy(pieces: readonly Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    for (const [x, z] of oracleFootprint(p.type, p.gridX, p.gridZ)) map.set(key(x, z), p);
  }
  return map;
}

/** True when the footprint is in the grid, free, and the station limit allows it. */
function oracleCanPlace(pieces: readonly Piece[], type: PieceType, x: number, z: number): boolean {
  if (type === 'station' && pieces.some((p) => p.type === 'station')) return false;
  const occ = oracleOccupancy(pieces);
  return oracleFootprint(type, x, z).every(
    ([tx, tz]) => tx >= 0 && tx <= 15 && tz >= 0 && tz <= 15 && !occ.has(key(tx, tz)),
  );
}

/** Edges of tile (x, z) that an adjacent track's connector faces. */
function facingEdges(pieces: readonly Piece[], x: number, z: number): Set<OracleDir> {
  const occ = oracleOccupancy(pieces);
  const edges = new Set<OracleDir>();
  for (const d of CLOCKWISE) {
    const [dx, dz] = DELTA[d];
    const n = occ.get(key(x + dx, z + dz));
    if (n && isTrack(n.type) && oracleConnectors(n.type, n.rotation).includes(OPPOSITE[d])) edges.add(d);
  }
  return edges;
}

/** Requirement 15: the rotation a new piece placed with auto-adjust should get. */
function oracleAutoRotation(
  pieces: readonly Piece[],
  type: PieceType,
  x: number,
  z: number,
  current: Rotation,
): Rotation {
  if (!isTrack(type)) return current;
  const facing = facingEdges(pieces, x, z);
  if (facing.size === 0) return current;
  const connects = (r: number) => oracleConnectors(type, r).some((d) => facing.has(d));
  if (connects(current)) return current; // 15.6
  for (const add of [90, 180, 270]) {
    const r = ((current + add) % 360) as Rotation;
    if (connects(r)) return r; // 15.1
  }
  return current; // 15.2
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** How the placement reaches the engine. */
type Path =
  | 'ui' // UI drop or click: ghost rotation r, auto-adjust on (15.1)
  | 'hookNoRotation' // placePiece without rotation: r = 0, auto-adjust on (15.4, 39.18)
  | 'hookWithRotation'; // placePiece with rotation: auto-adjust off (15.5)

const arbAnyBoard: fc.Arbitrary<Piece[]> = fc.oneof(arbBoard, arbLayoutWith({ decorations: true }));

const arbType: fc.Arbitrary<PieceType> = fc.oneof(
  { arbitrary: fc.constantFrom(...TRACK_TYPES), weight: 5 },
  { arbitrary: fc.constantFrom(...DECORATION_TYPES), weight: 1 },
);

interface Case {
  pieces: Piece[];
  type: PieceType;
  gridX: number;
  gridZ: number;
  rotation: Rotation;
  path: Path;
}

/**
 * A board, a type, a target tile and a starting rotation. Most targets are the
 * tile across a random open end, so auto-adjust has something to join.
 */
const arbCase: fc.Arbitrary<Case> = arbAnyBoard.chain((pieces) => {
  const across = openEnds(pieces)
    .map((e) => {
      const [dx, dz] = DELTA[CLOCKWISE[e.dir]!];
      return { gridX: e.tile.gridX + dx, gridZ: e.tile.gridZ + dz };
    })
    .filter((t) => t.gridX >= 0 && t.gridX <= 15 && t.gridZ >= 0 && t.gridZ <= 15);
  const anyTile = fc.record({ gridX: fc.integer({ min: 0, max: 15 }), gridZ: fc.integer({ min: 0, max: 15 }) });
  const target =
    across.length > 0
      ? fc.oneof({ arbitrary: fc.constantFrom(...across), weight: 4 }, { arbitrary: anyTile, weight: 1 })
      : anyTile;
  return fc.record({
    pieces: fc.constant(pieces),
    type: arbType,
    tile: target,
    rotation: fc.constantFrom(...ROTATIONS),
    path: fc.constantFrom<Path>('ui', 'hookNoRotation', 'hookWithRotation'),
  }).map(({ pieces, type, tile, rotation, path }) => ({ pieces, type, ...tile, rotation, path }));
});

function requestFor(c: Case): BuildRequest {
  switch (c.path) {
    case 'ui':
      return { kind: 'place', type: c.type, gridX: c.gridX, gridZ: c.gridZ, rotation: c.rotation, autoAdjust: true };
    case 'hookNoRotation':
      return { kind: 'place', type: c.type, gridX: c.gridX, gridZ: c.gridZ, autoAdjust: true };
    case 'hookWithRotation':
      return { kind: 'place', type: c.type, gridX: c.gridX, gridZ: c.gridZ, rotation: c.rotation, autoAdjust: false };
  }
}

function newIdGen(): () => string {
  let n = 0;
  return () => `new-${n++}`;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 13: Rotation choice for new placements', () => {
  it('applyBuild stores the rotation that Requirement 15 picks', () => {
    let autoRotated = 0;
    fc.assert(
      fc.property(arbCase, (c) => {
        fc.pre(oracleCanPlace(c.pieces, c.type, c.gridX, c.gridZ));

        const start: Rotation = c.path === 'hookNoRotation' ? 0 : c.rotation;
        const expected =
          c.path === 'hookWithRotation' ? start : oracleAutoRotation(c.pieces, c.type, c.gridX, c.gridZ, start);

        const outcome = applyBuild({ pieces: c.pieces, mode: 'build', newId: newIdGen() }, requestFor(c));
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;

        const placed = outcome.pieces.find((p) => p.id === outcome.id);
        expect(placed).toBeDefined();
        expect(placed!.rotation).toBe(expected);
        expect(outcome.pieces[outcome.pieces.length - 1]).toEqual(placed);
        if (outcome.entry?.kind === 'place') expect(outcome.entry.piece.rotation).toBe(expected);

        if (expected !== start) autoRotated++;
      }),
      { numRuns: 100 },
    );
    // The generator must actually exercise the rotation search.
    expect(autoRotated).toBeGreaterThan(0);
  });

  it('resolveAutoRotation matches the oracle for any free tile, type and starting rotation', () => {
    fc.assert(
      fc.property(arbCase, (c) => {
        fc.pre(oracleCanPlace(c.pieces, c.type, c.gridX, c.gridZ));
        expect(resolveAutoRotation(c.pieces, c.type, c.gridX, c.gridZ, c.rotation)).toBe(
          oracleAutoRotation(c.pieces, c.type, c.gridX, c.gridZ, c.rotation),
        );
      }),
      { numRuns: 100 },
    );
  });

  it('auto-adjust off keeps the given rotation, or 0 when omitted, even when it does not connect', () => {
    fc.assert(
      fc.property(arbCase, fc.boolean(), (c, omit) => {
        fc.pre(oracleCanPlace(c.pieces, c.type, c.gridX, c.gridZ));
        const request: BuildRequest = omit
          ? { kind: 'place', type: c.type, gridX: c.gridX, gridZ: c.gridZ, autoAdjust: false }
          : { kind: 'place', type: c.type, gridX: c.gridX, gridZ: c.gridZ, rotation: c.rotation, autoAdjust: false };
        const outcome = applyBuild({ pieces: c.pieces, mode: 'build', newId: newIdGen() }, request);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const placed = outcome.pieces.find((p) => p.id === outcome.id);
        expect(placed!.rotation).toBe(omit ? 0 : c.rotation);
      }),
      { numRuns: 100 },
    );
  });
});
