// Feature: track-diorama-builder, Property 6: Reason codes follow the rules and their precedence
/**
 * **Validates: Requirements 14.8, 16.2, 16.3, 16.4, 16.5, 16.10, 16.12, 18.4, 39.7, 39.8, 39.19, 41.2, 41.5**
 *
 * For any board, mode and build request, `applyBuild` rejects the request
 * exactly when a reference oracle, which checks the rules in the order
 * `play_mode`, `not_found`, `out_of_bounds`, `station_limit`, `on_track`,
 * `occupied` (ignoring the moving piece's own tiles), finds a broken rule, and
 * the returned reason equals the oracle's first broken rule; a track placed on
 * a free in-grid tile is accepted whether or not it connects.
 *
 * The oracle below is written from Requirement 16 and design §1.3 only. It
 * does not import the catalogue, grid, occupancy or placement modules: piece
 * types, track kinds, footprints and occupancy are restated here.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyBuild, checkFootprint, type BuildRequest } from '@/domain/placement';
import type { Piece, PieceType, Reason } from '@/domain/types';
import { arbBoardAndRequest, arbBoardAndRequests } from '../arbitraries';

// ---------------------------------------------------------------------------
// Independent reference oracle
// ---------------------------------------------------------------------------

/** Requirement 28.1: the 12 type ids. */
const ORACLE_TYPES = new Set<string>([
  'straight', 'curve', 'tunnel', 'station', 'buffer',
  'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks',
]);
/** Requirement 28.2: the 5 track types; all others are decorations. */
const ORACLE_TRACKS = new Set<string>(['straight', 'curve', 'tunnel', 'station', 'buffer']);

type Mode = 'build' | 'play';
type Expected = { ok: true } | { ok: false; reason: Reason };

/** Requirement 28.3: hill covers anchor, east, south and south-east; everything else the anchor only. */
function oracleFootprint(type: string, x: number, z: number): Array<[number, number]> {
  return type === 'hill'
    ? [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]]
    : [[x, z]];
}

const key = (x: number, z: number) => `${x},${z}`;

/** Tile key → piece covering it, built from the oracle footprint. */
function oracleOccupancy(pieces: readonly Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>();
  for (const p of pieces) {
    for (const [x, z] of oracleFootprint(p.type, p.gridX, p.gridZ)) map.set(key(x, z), p);
  }
  return map;
}

const isGoodRotation = (r: unknown) => r === 0 || r === 90 || r === 180 || r === 270;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const findPiece = (pieces: readonly Piece[], id: unknown) =>
  typeof id === 'string' ? pieces.find((p) => p.id === id) : undefined;

/** Rules 3 to 6 for a footprint (design §1.3). `moving` is the piece being moved, if any. */
function oracleFootprintRules(
  pieces: readonly Piece[],
  type: string,
  gridX: unknown,
  gridZ: unknown,
  moving: Piece | undefined,
): Reason | null {
  // 3. out_of_bounds: non-integer coordinate, or any footprint tile outside 0..15.
  if (!isInt(gridX) || !isInt(gridZ)) return 'out_of_bounds';
  const tiles = oracleFootprint(type, gridX, gridZ);
  if (tiles.some(([x, z]) => x < 0 || x > 15 || z < 0 || z > 15)) return 'out_of_bounds';

  // 4. station_limit: only for a new station (moves are exempt).
  if (moving === undefined && type === 'station' && pieces.some((p) => p.type === 'station')) {
    return 'station_limit';
  }

  const occ = oracleOccupancy(pieces);
  const others = tiles
    .map(([x, z]) => occ.get(key(x, z)))
    .filter((p): p is Piece => p !== undefined && p.id !== moving?.id);

  // 5. on_track: a decoration whose footprint covers a track tile.
  if (!ORACLE_TRACKS.has(type) && others.some((p) => ORACLE_TRACKS.has(p.type))) return 'on_track';
  // 6. occupied: any footprint tile holding another piece.
  if (others.length > 0) return 'occupied';
  return null;
}

/** Up to and including the not_found stage; null when the request passes it. */
function oraclePreFootprint(pieces: readonly Piece[], mode: Mode, req: BuildRequest): Reason | null {
  // 1. play_mode
  if (mode === 'play') return 'play_mode';
  // 2. not_found
  switch (req.kind) {
    case 'place':
      if (typeof req.type !== 'string' || !ORACLE_TYPES.has(req.type)) return 'not_found';
      if (req.rotation !== undefined && !isGoodRotation(req.rotation)) return 'not_found';
      return null;
    case 'move':
      if (!findPiece(pieces, req.id)) return 'not_found';
      if (req.rotation !== undefined && !isGoodRotation(req.rotation)) return 'not_found';
      return null;
    case 'rotate':
    case 'remove':
      return findPiece(pieces, req.id) ? null : 'not_found';
  }
}

function oracle(pieces: readonly Piece[], mode: Mode, req: BuildRequest): Expected {
  const pre = oraclePreFootprint(pieces, mode, req);
  if (pre) return { ok: false, reason: pre };
  let reason: Reason | null = null;
  if (req.kind === 'place') {
    reason = oracleFootprintRules(pieces, req.type as string, req.gridX, req.gridZ, undefined);
  } else if (req.kind === 'move') {
    const moving = findPiece(pieces, req.id)!;
    reason = oracleFootprintRules(pieces, moving.type, req.gridX, req.gridZ, moving);
  }
  // Rotate and remove only fail with play_mode or not_found (Assumption 6).
  return reason ? { ok: false, reason } : { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeBoard(pieces: readonly Piece[]): readonly Piece[] {
  return Object.freeze(pieces.map((p) => Object.freeze({ ...p })));
}

function newIdFactory(): () => string {
  let n = 1;
  return () => `n${n++}`;
}

const arbMode: fc.Arbitrary<Mode> = fc.oneof(
  { arbitrary: fc.constant<Mode>('build'), weight: 4 },
  { arbitrary: fc.constant<Mode>('play'), weight: 1 },
);

/** Type strings that are object or Map prototype keys, to catch lookups that are not own-key checks. */
const arbPrototypeType = fc.constantFrom('toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf');

/**
 * Applies one request against the oracle and checks applyBuild's verdict,
 * immutability on rejection, and checkFootprint agreement. Returns the new
 * board (unchanged on rejection) and the observed outcome label.
 */
function checkOne(pieces: readonly Piece[], mode: Mode, req: BuildRequest): { next: readonly Piece[]; label: string } {
  const board = freezeBoard(pieces);
  const before = structuredClone(board) as Piece[];
  const expected = oracle(board, mode, req);

  const outcome = applyBuild({ pieces: board, mode, newId: newIdFactory() }, req);

  if (expected.ok) {
    expect(outcome.ok, `expected ok for ${JSON.stringify(req)}`).toBe(true);
  } else {
    expect(outcome, `expected ${expected.reason} for ${JSON.stringify(req)}`).toEqual({
      ok: false,
      reason: expected.reason,
    });
  }
  // The input board is never mutated (frozen, and still deep-equal).
  expect(board).toEqual(before);

  // checkFootprint agrees with applyBuild for place and move requests that pass not_found.
  if (oraclePreFootprint(board, 'build', req) === null && (req.kind === 'place' || req.kind === 'move')) {
    const buildOutcome =
      mode === 'build' ? outcome : applyBuild({ pieces: board, mode: 'build', newId: newIdFactory() }, req);
    const fp =
      req.kind === 'place'
        ? checkFootprint(board, req.type as PieceType, req.gridX as number, req.gridZ as number, { isNew: true })
        : checkFootprint(
            board,
            findPiece(board, req.id)!.type,
            req.gridX as number,
            req.gridZ as number,
            { movingId: req.id as string, isNew: false },
          );
    expect(fp).toBe(buildOutcome.ok ? null : buildOutcome.reason);
  }

  const label = outcome.ok ? 'ok' : outcome.reason;
  return { next: outcome.ok ? outcome.pieces : board, label };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 6: Reason codes follow the rules and their precedence', () => {
  it('applyBuild matches the reference oracle for one request in either mode', () => {
    fc.assert(
      fc.property(arbBoardAndRequest, arbMode, ({ pieces, request }, mode) => {
        checkOne(pieces, mode, request);
      }),
      { numRuns: 100 },
    );
  });

  it('applyBuild matches the oracle along request sequences, and every outcome occurs', () => {
    const seen = new Map<string, number>();
    fc.assert(
      fc.property(
        arbBoardAndRequests(20),
        fc.array(arbMode, { minLength: 20, maxLength: 20 }),
        ({ pieces, requests }, modes) => {
          let board: readonly Piece[] = pieces;
          requests.forEach((req, i) => {
            const { next, label } = checkOne(board, modes[i]!, req);
            seen.set(label, (seen.get(label) ?? 0) + 1);
            board = next;
          });
        },
      ),
      { numRuns: 100 },
    );
    // The generators reach every rule, so the comparison above is not vacuous.
    for (const label of ['ok', 'play_mode', 'not_found', 'out_of_bounds', 'station_limit', 'on_track', 'occupied']) {
      expect(seen.get(label) ?? 0, `outcome ${label} never generated`).toBeGreaterThan(0);
    }
  });

  it('prototype-key type names are unknown types (not_found)', () => {
    fc.assert(
      fc.property(
        arbBoardAndRequest,
        arbPrototypeType,
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        ({ pieces }, type, gridX, gridZ) => {
          checkOne(pieces, 'build', { kind: 'place', type, gridX, gridZ, autoAdjust: false });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('a track on a free in-grid tile is accepted whether or not it connects', () => {
    fc.assert(
      fc.property(
        arbBoardAndRequest,
        fc.constantFrom('straight', 'curve', 'tunnel', 'buffer', 'station'),
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        fc.option(fc.constantFrom(0, 90, 180, 270), { nil: undefined }),
        fc.boolean(),
        ({ pieces }, type, gridX, gridZ, rotation, autoAdjust) => {
          const occ = oracleOccupancy(pieces);
          fc.pre(!occ.has(key(gridX, gridZ)));
          fc.pre(type !== 'station' || !pieces.some((p) => p.type === 'station'));
          const req: Extract<BuildRequest, { kind: 'place' }> = { kind: 'place', type, gridX, gridZ, autoAdjust };
          if (rotation !== undefined) req.rotation = rotation;
          const outcome = applyBuild({ pieces: freezeBoard(pieces), mode: 'build', newId: newIdFactory() }, req);
          expect(outcome.ok).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
