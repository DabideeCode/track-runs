/**
 * Shared fast-check generators for persistence tests.
 *
 * Every generator here builds *valid* data directly from the rules in
 * Requirement 24.1 and design decision D-20. None of them calls the
 * validators in `saveFormat.ts`, the catalogue or the grid helpers, so tests
 * that check those validators do not share logic with them.
 *
 * Rules encoded:
 * - Piece: string id (unique within its diorama), one of the 12 type ids,
 *   integer gridX and gridZ in 0..15 (a 2 × 2 hill anchored at 0..14),
 *   rotation 0, 90, 180 or 270; footprints never share a tile; at most one
 *   station.
 * - Diorama: non-empty unique id, name of 1 to 40 UTF-16 code units that is not
 *   blank, setting 'bedroom' or 'kitchen', startFacing 0 or 180, createdAt and
 *   updatedAt from `Date.prototype.toISOString` with updatedAt ≥ createdAt,
 *   thumbnail either absent or a string.
 */
import fc from 'fast-check';
import type { Diorama, Piece, PieceType, Rotation, SaveFile } from '@/domain/types';

/** The 12 type ids from Section 6 of requirement.md, written out independently. */
export const PIECE_TYPES: readonly PieceType[] = [
  'straight', 'curve', 'tunnel', 'station', 'buffer',
  'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks',
];

export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Largest instant whose ISO string still has a 4-digit year (9999-12-31T23:59:59.999Z). */
const MAX_ISO_MS = 253_402_300_799_999;

/** Tiles covered by a piece: the anchor, plus east, south and south-east for a hill. */
function coveredTiles(p: Pick<Piece, 'type' | 'gridX' | 'gridZ'>): Array<[number, number]> {
  const tiles: Array<[number, number]> = [[p.gridX, p.gridZ]];
  if (p.type === 'hill') {
    tiles.push([p.gridX + 1, p.gridZ], [p.gridX, p.gridZ + 1], [p.gridX + 1, p.gridZ + 1]);
  }
  return tiles;
}

/** A single in-grid piece with an arbitrary string id (no board-level rules). */
export const arbPieceCandidate: fc.Arbitrary<Piece> = fc
  .record({
    id: fc.string({ maxLength: 12 }),
    type: fc.constantFrom(...PIECE_TYPES),
    a: fc.integer({ min: 0, max: 15 }),
    b: fc.integer({ min: 0, max: 15 }),
    rotation: fc.constantFrom(...ROTATIONS),
  })
  .map(({ id, type, a, b, rotation }) => {
    const max = type === 'hill' ? 14 : 15;
    return { id, type, gridX: Math.min(a, max), gridZ: Math.min(b, max), rotation };
  });

/**
 * A valid board: candidate pieces with unique ids are kept in order when all
 * their tiles are still free and, for a station, no station has been kept yet.
 */
export const arbPieces: fc.Arbitrary<Piece[]> = fc
  .uniqueArray(arbPieceCandidate, { maxLength: 40, selector: (p) => p.id })
  .map((candidates) => {
    const used = new Set<string>();
    let hasStation = false;
    const kept: Piece[] = [];
    for (const p of candidates) {
      if (p.type === 'station' && hasStation) continue;
      const tiles = coveredTiles(p).map(([x, z]) => `${x},${z}`);
      if (tiles.some((t) => used.has(t))) continue;
      for (const t of tiles) used.add(t);
      if (p.type === 'station') hasStation = true;
      kept.push(p);
    }
    return kept;
  });

/**
 * Names of 1 to 40 UTF-16 code units that are not blank: ASCII names, names with
 * any Unicode (including astral characters and lone surrogates), and names with
 * leading or trailing spaces (stored names are not required to be trimmed).
 */
export const arbName: fc.Arbitrary<string> = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.string({ unit: 'binary', minLength: 1, maxLength: 40 }),
    fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }),
    fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.nat({ max: 5 })).map(
      ([s, pad]) => `${' '.repeat(pad)}${s}${' '.repeat(pad)}`,
    ),
  )
  .filter((s) => s.length >= 1 && s.length <= 40 && s.trim().length > 0);

/** createdAt ≤ updatedAt, both UTC ISO 8601 strings from `toISOString`. */
export const arbTimestamps: fc.Arbitrary<{ createdAt: string; updatedAt: string }> = fc
  .tuple(fc.integer({ min: 0, max: MAX_ISO_MS }), fc.integer({ min: 0, max: MAX_ISO_MS }))
  .map(([a, b]) => ({
    createdAt: new Date(Math.min(a, b)).toISOString(),
    updatedAt: new Date(Math.max(a, b)).toISOString(),
  }));

/** Thumbnail strings: data URLs and arbitrary text (any string is valid). */
export const arbThumbnail: fc.Arbitrary<string> = fc.oneof(
  fc.base64String({ maxLength: 64 }).map((b) => `data:image/jpeg;base64,${b}`),
  fc.string({ maxLength: 20 }),
);

/** A valid diorama. The `thumbnail` key is omitted (not undefined) when absent. */
export const arbDiorama: fc.Arbitrary<Diorama> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 21 }),
    name: arbName,
    setting: fc.constantFrom<Diorama['setting']>('bedroom', 'kitchen'),
    startFacing: fc.constantFrom<Diorama['startFacing']>(0, 180),
    pieces: arbPieces,
    times: arbTimestamps,
    thumbnail: fc.option(arbThumbnail, { nil: undefined }),
  })
  .map(({ id, name, setting, startFacing, pieces, times, thumbnail }) => {
    const d: Diorama = { id, name, setting, startFacing, pieces, ...times };
    if (thumbnail !== undefined) d.thumbnail = thumbnail;
    return d;
  });

/** A list of valid dioramas with unique ids. */
export const arbDioramas = (maxLength = 6): fc.Arbitrary<Diorama[]> =>
  fc.uniqueArray(arbDiorama, { maxLength, selector: (d) => d.id });

/** A valid SaveFile. */
export const arbSaveFile = (maxLength = 6): fc.Arbitrary<SaveFile> =>
  arbDioramas(maxLength).map((dioramas) => ({ version: 1 as const, dioramas }));

// ---------------------------------------------------------------------------
// Invalid entries
// ---------------------------------------------------------------------------

/** Required diorama keys; removing any one of them makes the entry invalid. */
const REQUIRED_DIORAMA_KEYS = [
  'id', 'name', 'setting', 'startFacing', 'pieces', 'createdAt', 'updatedAt',
] as const;

/** Replaces one field of a valid diorama with a value that breaks its rule. */
function withField(key: string, values: fc.Arbitrary<unknown>): fc.Arbitrary<unknown> {
  return fc.tuple(arbDiorama, values).map(([d, v]) => ({ ...d, [key]: v }));
}

/** Pieces that each break a piece rule on their own, whatever board they join. */
const arbInvalidPiece: fc.Arbitrary<unknown> = fc.oneof(
  // Bad rotation.
  fc.constantFrom<unknown>(45, 360, -90, '90', null).map((rotation) => ({
    id: 'bad-rot', type: 'straight', gridX: 3, gridZ: 3, rotation,
  })),
  // Unknown type.
  fc.constantFrom<unknown>('bridge', 'Straight', '', 7).map((type) => ({
    id: 'bad-type', type, gridX: 3, gridZ: 3, rotation: 0,
  })),
  // gridX or gridZ off the grid, not an integer, or not a number.
  fc.tuple(fc.constantFrom<unknown>(16, -1, 1.5, '3', null), fc.boolean()).map(([v, onX]) => ({
    id: 'bad-coord', type: 'house', gridX: onX ? v : 4, gridZ: onX ? 4 : v, rotation: 0,
  })),
  // A hill anchored at 15 (its footprint leaves the grid).
  fc.tuple(fc.integer({ min: 0, max: 15 }), fc.boolean(), fc.constantFrom(...ROTATIONS)).map(
    ([other, onX, rotation]) => ({
      id: 'bad-hill', type: 'hill', gridX: onX ? 15 : Math.min(other, 14), gridZ: onX ? Math.min(other, 14) : 15, rotation,
    }),
  ),
  // Id not a string.
  fc.constantFrom<unknown>(7, null).map((id) => ({ id, type: 'buffer', gridX: 2, gridZ: 2, rotation: 0 })),
  // Missing field.
  fc.constantFrom('id', 'type', 'gridX', 'gridZ', 'rotation').map((key) => {
    const p: Record<string, unknown> = { id: 'missing', type: 'curve', gridX: 5, gridZ: 5, rotation: 90 };
    delete p[key];
    return p;
  }),
  // Not an object.
  fc.constantFrom<unknown>(null, 5, 'piece', [], true),
);

/** Whole boards that break exactly one board-level rule (D-20). */
const INVALID_BOARDS: readonly unknown[][] = [
  // Duplicate piece ids on separate tiles.
  [
    { id: 'same', type: 'straight', gridX: 0, gridZ: 0, rotation: 0 },
    { id: 'same', type: 'straight', gridX: 5, gridZ: 5, rotation: 0 },
  ],
  // Two pieces on one tile.
  [
    { id: 'a', type: 'house', gridX: 3, gridZ: 3, rotation: 0 },
    { id: 'b', type: 'car', gridX: 3, gridZ: 3, rotation: 90 },
  ],
  // A hill footprint covering another piece's anchor.
  [
    { id: 'h', type: 'hill', gridX: 0, gridZ: 0, rotation: 0 },
    { id: 's', type: 'straight', gridX: 1, gridZ: 1, rotation: 0 },
  ],
  // Two stations.
  [
    { id: 's1', type: 'station', gridX: 0, gridZ: 0, rotation: 0 },
    { id: 's2', type: 'station', gridX: 2, gridZ: 2, rotation: 90 },
  ],
];

/**
 * A stored `dioramas` entry that fails validation. Each case starts from a
 * valid diorama (or is a non-object) and breaks one rule from Requirement 24.1
 * or D-20, so the entry is invalid whatever the rest of the file holds.
 */
export const arbInvalidEntry: fc.Arbitrary<unknown> = fc.oneof(
  // Missing required field.
  fc.tuple(arbDiorama, fc.constantFrom(...REQUIRED_DIORAMA_KEYS)).map(([d, key]) => {
    const copy: Record<string, unknown> = { ...d };
    delete copy[key];
    return copy;
  }),
  // Wrong id.
  withField('id', fc.constantFrom<unknown>('', 0, null, ['x'])),
  // Bad name: empty, blank, 41 code units, not a string.
  withField(
    'name',
    fc.oneof(
      fc.constant(''),
      fc.integer({ min: 1, max: 40 }).map((n) => ' \t\n'.repeat(n).slice(0, n)),
      fc.string({ minLength: 1, maxLength: 1 }).filter((c) => c.trim() !== '').map((c) => c.repeat(41)),
      fc.constantFrom<unknown>(42, null, ['name']),
    ),
  ),
  // Bad setting.
  withField('setting', fc.constantFrom<unknown>('garden', 'Bedroom', '', null, 1)),
  // Bad startFacing.
  withField('startFacing', fc.constantFrom<unknown>(90, 270, 360, -180, '0', null)),
  // pieces not an array.
  withField('pieces', fc.constantFrom<unknown>({}, 'pieces', null, 3)),
  // Bad ISO 8601 date in createdAt or updatedAt.
  fc
    .tuple(
      arbDiorama,
      fc.constantFrom('createdAt', 'updatedAt'),
      fc.constantFrom<unknown>(
        'yesterday', '', '2024-01-01', '2024-02-30T10:00:00Z', '2024-01-01T24:00:00Z',
        '2024-13-01T10:00:00Z', '2024-01-01 10:00:00Z', 1_700_000_000_000, null,
      ),
    )
    .map(([d, key, v]) => ({ ...d, [key]: v })),
  // thumbnail present but not a string.
  withField('thumbnail', fc.constantFrom<unknown>(42, null, {}, true, ['data:'])),
  // One bad piece added to an otherwise valid board.
  fc
    .tuple(arbDiorama, arbInvalidPiece, fc.nat())
    .map(([d, bad, at]) => {
      const pieces: unknown[] = [...d.pieces];
      pieces.splice(at % (pieces.length + 1), 0, bad);
      return { ...d, pieces };
    }),
  // A board that breaks a board-level rule.
  fc.tuple(arbDiorama, fc.constantFrom(...INVALID_BOARDS)).map(([d, pieces]) => ({ ...d, pieces })),
  // Not an object at all.
  fc.oneof(
    fc.constant(null),
    fc.double(),
    fc.integer(),
    fc.string({ maxLength: 10 }),
    fc.boolean(),
    fc.array(fc.integer(), { maxLength: 3 }),
    arbDiorama.map((d) => [d]),
  ),
);
