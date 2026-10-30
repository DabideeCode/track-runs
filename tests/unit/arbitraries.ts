/**
 * Shared fast-check generators for behaviour property tests (task 4.3).
 *
 * Unlike `tests/unit/persistence/arbitraries.ts`, which builds valid save data
 * without touching the domain, these generators drive the placement engine:
 * every board comes from successful `applyBuild` calls in Build mode, so every
 * generated board is one a user could reach (Requirement 16.8).
 *
 * Exports
 * - `ID_GEN(prefix, start)`: deterministic id factory (`p1`, `p2`, ...).
 * - `TRACK_TYPES`, `DECORATION_TYPES`, `PIECE_TYPES`, `ROTATIONS`.
 * - `arbBoard` / `arbBoardWith(opts)`: `Piece[]` reached by random place, move,
 *   rotate and remove requests, clustered in a random square region so
 *   connections, `occupied` and `on_track` happen often.
 * - `arbBoardWithHistory(opts)`: the same boards plus the successful requests
 *   and outcomes that built them, and `nextIdStart` for continuing with
 *   `ID_GEN('p', nextIdStart)` without id clashes.
 * - `arbRequest(ids, hotTiles)`: any `BuildRequest`, valid or not.
 * - `arbBoardAndRequest`, `arbBoardAndRequests(max)`: a board paired with
 *   requests that target its ids and tiles.
 * - `arbLayout` / `arbLayoutWith(opts)`: track layouts with exactly one
 *   station, grown mostly from open ends with auto-adjust on.
 * - `arbLoop(opts)`: closed rectangular loops (`LoopBoard`).
 *
 * Decision: `arbBoard` returns plain `Piece[]`; tests that need the request
 * sequence use `arbBoardWithHistory`. Ids are `p1`, `p2`, ... in placement
 * order; the counter only advances on a successful place, and removed ids are
 * never reused.
 *
 * Note for oracle writers: `arbRequest` can send `-0` as a coordinate. It is an
 * integer, so it is in the grid, and `applyBuild` stores it as `0`.
 */
import fc from 'fast-check';
import { applyBuild, type BuildOutcome, type BuildRequest } from '@/domain/placement';
import { openEnds } from '@/domain/connections';
import { dirDelta } from '@/domain/connectors';
import type { DecorationType, Piece, PieceType, Rotation, Tile, TrackType } from '@/domain/types';

// ---------------------------------------------------------------------------
// Constants and ids
// ---------------------------------------------------------------------------

export const TRACK_TYPES: readonly TrackType[] = ['straight', 'curve', 'tunnel', 'station', 'buffer'];
export const DECORATION_TYPES: readonly DecorationType[] = [
  'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks',
];
export const PIECE_TYPES: readonly PieceType[] = [...TRACK_TYPES, ...DECORATION_TYPES];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** A deterministic id generator: `${prefix}${start}`, `${prefix}${start + 1}`, ... */
export function ID_GEN(prefix = 'p', start = 1): () => string {
  let n = start;
  return () => `${prefix}${n++}`;
}

export type AppliedStep = {
  request: BuildRequest;
  outcome: Extract<BuildOutcome, { ok: true }>;
};

export interface BoardWithHistory {
  pieces: Piece[];
  /** Successful requests in order; replaying them on an empty board with `ID_GEN()` gives `pieces`. */
  steps: AppliedStep[];
  /** Next counter value for `ID_GEN('p', nextIdStart)`. */
  nextIdStart: number;
}

/** Applies requests in Build mode, keeping only accepted ones. */
function applyAccepted(requests: readonly BuildRequest[], start: readonly Piece[] = []): BoardWithHistory {
  let n = 1;
  const newId = () => `p${n++}`;
  let pieces: Piece[] = start.map((p) => ({ ...p }));
  const steps: AppliedStep[] = [];
  for (const request of requests) {
    const outcome = applyBuild({ pieces, mode: 'build', newId }, request);
    if (!outcome.ok) continue;
    pieces = outcome.pieces;
    steps.push({ request, outcome });
  }
  return { pieces, steps, nextIdStart: n };
}

// ---------------------------------------------------------------------------
// Type and value arbitraries
// ---------------------------------------------------------------------------

/** Valid piece types, tracks three times as likely as each decoration group. */
const arbTypeBiased: fc.Arbitrary<PieceType> = fc.oneof(
  { arbitrary: fc.constantFrom(...TRACK_TYPES), weight: 3 },
  { arbitrary: fc.constantFrom(...DECORATION_TYPES), weight: 1 },
);

const arbMaybeRotation: fc.Arbitrary<Rotation | undefined> = fc.option(fc.constantFrom(...ROTATIONS), {
  nil: undefined,
});

/** Coordinates that are not in-grid integers (plus `-0`, which is). */
const arbBadCoord: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(
  -1, 16, 17, 1.5, -0.5, 15.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
  1e9, -0, '3', null, undefined, true,
);

const arbBadType: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(
  'rocket', '', 'Straight', 'STATION', 'pine-tree', null, undefined, 42,
);

const arbBadRotation: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(45, '90', null, -90, 360, 90.5, Number.NaN);

const arbGridCoord = fc.integer({ min: 0, max: 15 });

// ---------------------------------------------------------------------------
// arbBoard
// ---------------------------------------------------------------------------

export interface BoardOptions {
  /** Number of random requests tried (default 40). Rejected requests are dropped. */
  maxSteps?: number;
}

type BoardStep = {
  /** `extend` places across a random open end (falls back to the region when there is none). */
  kind: 'place' | 'extend' | 'move' | 'rotate' | 'remove';
  type: PieceType;
  dx: number;
  dz: number;
  rotation: Rotation | undefined;
  autoAdjust: boolean;
  pick: number;
};

const arbBoardStep: fc.Arbitrary<BoardStep> = fc.record({
  kind: fc.oneof(
    { arbitrary: fc.constant('place' as const), weight: 4 },
    { arbitrary: fc.constant('extend' as const), weight: 3 },
    { arbitrary: fc.constant('move' as const), weight: 2 },
    { arbitrary: fc.constant('rotate' as const), weight: 2 },
    { arbitrary: fc.constant('remove' as const), weight: 1 },
  ),
  type: arbTypeBiased,
  dx: fc.nat({ max: 15 }),
  dz: fc.nat({ max: 15 }),
  rotation: arbMaybeRotation,
  autoAdjust: fc.boolean(),
  pick: fc.nat(),
});

/**
 * A square region of 3 to 16 tiles per side, usually small (4 to 8) so pieces
 * crowd together; coordinates wrap inside the grid.
 */
const arbRegion = fc.record({
  ox: fc.nat({ max: 15 }),
  oz: fc.nat({ max: 15 }),
  size: fc.oneof(
    { arbitrary: fc.integer({ min: 4, max: 8 }), weight: 3 },
    { arbitrary: fc.integer({ min: 9, max: 16 }), weight: 1 },
  ),
});

function boardRun(
  region: { ox: number; oz: number; size: number },
  steps: readonly BoardStep[],
): BoardWithHistory {
  let n = 1;
  const newId = () => `p${n++}`;
  let pieces: Piece[] = [];
  const applied: AppliedStep[] = [];
  for (const s of steps) {
    let gridX = (region.ox + (s.dx % region.size)) % 16;
    let gridZ = (region.oz + (s.dz % region.size)) % 16;
    if (s.kind === 'extend') {
      const ends = openEnds(pieces);
      if (ends.length > 0) {
        const end = ends[s.pick % ends.length]!;
        const { dx, dz } = dirDelta(end.dir);
        gridX = end.tile.gridX + dx;
        gridZ = end.tile.gridZ + dz;
      }
    }
    let request: BuildRequest;
    if (s.kind === 'place' || s.kind === 'extend') {
      // Extending an open end always uses auto-adjust, so it usually connects.
      request = { kind: 'place', type: s.type, gridX, gridZ, autoAdjust: s.autoAdjust || s.kind === 'extend' };
      if (s.rotation !== undefined) request.rotation = s.rotation;
    } else {
      if (pieces.length === 0) continue;
      const id = pieces[s.pick % pieces.length]!.id;
      if (s.kind === 'move') {
        request = { kind: 'move', id, gridX, gridZ };
        if (s.rotation !== undefined) request.rotation = s.rotation;
      } else {
        request = { kind: s.kind, id };
      }
    }
    const outcome = applyBuild({ pieces, mode: 'build', newId }, request);
    if (!outcome.ok) continue;
    pieces = outcome.pieces;
    applied.push({ request, outcome });
  }
  return { pieces, steps: applied, nextIdStart: n };
}

/** Boards reached by random accepted requests, with the requests that built them. */
export function arbBoardWithHistory(opts: BoardOptions = {}): fc.Arbitrary<BoardWithHistory> {
  const maxSteps = opts.maxSteps ?? 40;
  return fc
    .tuple(arbRegion, fc.array(arbBoardStep, { maxLength: maxSteps, size: 'max' }))
    .map(([region, steps]) => boardRun(region, steps));
}

/** Boards reached by random accepted requests. */
export function arbBoardWith(opts: BoardOptions = {}): fc.Arbitrary<Piece[]> {
  return arbBoardWithHistory(opts).map((b) => b.pieces);
}

/** A reachable board from up to 40 random requests (often fewer, since rejected requests are dropped). */
export const arbBoard: fc.Arbitrary<Piece[]> = arbBoardWith();

// ---------------------------------------------------------------------------
// arbRequest
// ---------------------------------------------------------------------------

/** Tiles covered by pieces, for biasing request coordinates toward a board. */
export function boardTiles(pieces: readonly Piece[]): Tile[] {
  const tiles: Tile[] = [];
  for (const p of pieces) {
    tiles.push({ gridX: p.gridX, gridZ: p.gridZ });
    if (p.type === 'hill') {
      tiles.push(
        { gridX: p.gridX + 1, gridZ: p.gridZ },
        { gridX: p.gridX, gridZ: p.gridZ + 1 },
        { gridX: p.gridX + 1, gridZ: p.gridZ + 1 },
      );
    }
  }
  return tiles;
}

function arbCoords(hotTiles: readonly Tile[]): fc.Arbitrary<{ gridX: unknown; gridZ: unknown }> {
  const inGrid = fc.record({ gridX: arbGridCoord, gridZ: arbGridCoord });
  const bad = fc.oneof(
    fc.record({ gridX: arbBadCoord, gridZ: arbGridCoord }),
    fc.record({ gridX: arbGridCoord, gridZ: arbBadCoord }),
    fc.record({ gridX: arbBadCoord, gridZ: arbBadCoord }),
  );
  const options: Array<fc.WeightedArbitrary<{ gridX: unknown; gridZ: unknown }>> = [
    { arbitrary: inGrid, weight: 6 },
    { arbitrary: bad, weight: 2 },
  ];
  if (hotTiles.length > 0) {
    // On or next to an occupied tile; may step off the grid at the edges.
    const near = fc
      .tuple(fc.constantFrom(...hotTiles), fc.integer({ min: -1, max: 1 }), fc.integer({ min: -1, max: 1 }))
      .map(([t, dx, dz]) => ({ gridX: t.gridX + dx, gridZ: t.gridZ + dz }));
    options.push({ arbitrary: near, weight: 6 });
  }
  return fc.oneof(...options);
}

function arbId(ids: readonly string[]): fc.Arbitrary<unknown> {
  const known = new Set(ids);
  const unknown = fc
    .constantFrom<unknown>('nope', 'p999999', '', 'P1', null, undefined, 1, {})
    .filter((x) => typeof x !== 'string' || !known.has(x));
  if (ids.length === 0) return unknown;
  return fc.oneof({ arbitrary: fc.constantFrom(...ids), weight: 6 }, { arbitrary: unknown, weight: 1 });
}

function arbRotationField(): fc.Arbitrary<unknown> {
  return fc.oneof(
    { arbitrary: fc.constant(undefined), weight: 3 },
    { arbitrary: fc.constantFrom(...ROTATIONS), weight: 5 },
    { arbitrary: arbBadRotation, weight: 1 },
  );
}

/** Copies `rotation` onto the request only when it is not undefined, so "absent" is the usual form. */
function withRotation<T extends BuildRequest>(req: T, rotation: unknown): T {
  return rotation === undefined ? req : { ...req, rotation };
}

/**
 * Any build request: place, move, rotate or remove with valid and invalid
 * fields. Ids are drawn mostly from `ids`, and coordinates mostly from the
 * grid or near `hotTiles`, so many requests succeed.
 */
export function arbRequest(ids: readonly string[] = [], hotTiles: readonly Tile[] = []): fc.Arbitrary<BuildRequest> {
  const coords = arbCoords(hotTiles);
  const type = fc.oneof({ arbitrary: arbTypeBiased, weight: 8 }, { arbitrary: arbBadType, weight: 1 });

  const place: fc.Arbitrary<BuildRequest> = fc
    .record({ type, coords, rotation: arbRotationField(), autoAdjust: fc.boolean() })
    .map(({ type, coords, rotation, autoAdjust }) =>
      withRotation({ kind: 'place' as const, type, ...coords, autoAdjust }, rotation),
    );

  // A hill anchored on the last row or column: its footprint leaves the grid.
  const hillAtEdge: fc.Arbitrary<BuildRequest> = fc
    .record({ other: arbGridCoord, onX: fc.boolean(), rotation: arbRotationField(), autoAdjust: fc.boolean() })
    .map(({ other, onX, rotation, autoAdjust }) =>
      withRotation(
        {
          kind: 'place' as const,
          type: 'hill',
          gridX: onX ? 15 : other,
          gridZ: onX ? other : 15,
          autoAdjust,
        },
        rotation,
      ),
    );

  const move: fc.Arbitrary<BuildRequest> = fc
    .record({ id: arbId(ids), coords, rotation: arbRotationField() })
    .map(({ id, coords, rotation }) => withRotation({ kind: 'move' as const, id, ...coords }, rotation));

  const rotate: fc.Arbitrary<BuildRequest> = arbId(ids).map((id) => ({ kind: 'rotate' as const, id }));
  const remove: fc.Arbitrary<BuildRequest> = arbId(ids).map((id) => ({ kind: 'remove' as const, id }));

  return fc.oneof(
    { arbitrary: place, weight: 5 },
    { arbitrary: hillAtEdge, weight: 1 },
    { arbitrary: move, weight: 3 },
    { arbitrary: rotate, weight: 2 },
    { arbitrary: remove, weight: 2 },
  );
}

/** A reachable board and one request aimed at its ids and tiles. */
export const arbBoardAndRequest: fc.Arbitrary<{ pieces: Piece[]; request: BuildRequest }> = arbBoard.chain(
  (pieces) =>
    arbRequest(pieces.map((p) => p.id), boardTiles(pieces)).map((request) => ({ pieces, request })),
);

/** A reachable board and up to `max` requests aimed at its starting ids and tiles. */
export function arbBoardAndRequests(max = 20): fc.Arbitrary<{ pieces: Piece[]; requests: BuildRequest[] }> {
  return arbBoard.chain((pieces) =>
    fc
      .array(arbRequest(pieces.map((p) => p.id), boardTiles(pieces)), { maxLength: max })
      .map((requests) => ({ pieces, requests })),
  );
}

// ---------------------------------------------------------------------------
// arbLayout
// ---------------------------------------------------------------------------

export interface LayoutOptions {
  /** Number of placements tried after the station (default 24). */
  maxSteps?: number;
  /** Allow decorations as well as tracks (default false). */
  decorations?: boolean;
}

const NON_STATION_TRACKS: readonly TrackType[] = TRACK_TYPES.filter((t) => t !== 'station');

/**
 * Track layouts with exactly one station. After the station, each step places
 * a track (or, if allowed, a decoration) either across a random open end
 * (most of the time) or near the station, usually with auto-adjust on, so
 * connected runs, branches, dead ends and buffers are all common.
 */
export function arbLayoutWith(opts: LayoutOptions = {}): fc.Arbitrary<Piece[]> {
  const maxSteps = opts.maxSteps ?? 24;
  const type: fc.Arbitrary<PieceType> = opts.decorations
    ? fc.oneof(
        { arbitrary: fc.constantFrom(...NON_STATION_TRACKS), weight: 4 },
        { arbitrary: fc.constantFrom(...DECORATION_TYPES), weight: 1 },
      )
    : fc.oneof(
        { arbitrary: fc.constant<PieceType>('straight'), weight: 4 },
        { arbitrary: fc.constant<PieceType>('curve'), weight: 3 },
        { arbitrary: fc.constant<PieceType>('tunnel'), weight: 1 },
        { arbitrary: fc.constant<PieceType>('buffer'), weight: 1 },
      );
  const step = fc.record({
    follow: fc.oneof({ arbitrary: fc.constant(true), weight: 4 }, { arbitrary: fc.constant(false), weight: 1 }),
    endPick: fc.nat(),
    dx: fc.integer({ min: -4, max: 4 }),
    dz: fc.integer({ min: -4, max: 4 }),
    type,
    rotation: fc.constantFrom(...ROTATIONS),
    autoAdjust: fc.oneof({ arbitrary: fc.constant(true), weight: 3 }, { arbitrary: fc.constant(false), weight: 1 }),
  });
  return fc
    .record({
      sx: arbGridCoord,
      sz: arbGridCoord,
      sr: fc.constantFrom(...ROTATIONS),
      steps: fc.array(step, { maxLength: maxSteps, size: 'max' }),
    })
    .map(({ sx, sz, sr, steps }) => {
      let n = 1;
      const newId = () => `p${n++}`;
      const first = applyBuild(
        { pieces: [], mode: 'build', newId },
        { kind: 'place', type: 'station', gridX: sx, gridZ: sz, rotation: sr, autoAdjust: false },
      );
      if (!first.ok) throw new Error(`arbLayout: station placement failed (${first.reason})`);
      let pieces = first.pieces;
      for (const s of steps) {
        let gridX = sx + s.dx;
        let gridZ = sz + s.dz;
        const ends = s.follow ? openEnds(pieces) : [];
        if (ends.length > 0) {
          const end = ends[s.endPick % ends.length]!;
          const { dx, dz } = dirDelta(end.dir);
          gridX = end.tile.gridX + dx;
          gridZ = end.tile.gridZ + dz;
        }
        const outcome = applyBuild(
          { pieces, mode: 'build', newId },
          { kind: 'place', type: s.type, gridX, gridZ, rotation: s.rotation, autoAdjust: s.autoAdjust },
        );
        if (outcome.ok) pieces = outcome.pieces;
      }
      return pieces;
    });
}

/** Track-only layouts with exactly one station. */
export const arbLayout: fc.Arbitrary<Piece[]> = arbLayoutWith();

// ---------------------------------------------------------------------------
// arbLoop
// ---------------------------------------------------------------------------

/*
 * Curve rotations, worked out from the catalogue: a curve at 0° connects S and
 * E, and each 90° turns its connectors clockwise (N → E → S → W).
 *   0°   S, E   north-west corner
 *   90°  W, S   north-east corner
 *   180° N, W   south-east corner
 *   270° E, N   south-west corner
 * Straights (and the station and tunnel) at 0° or 180° connect N and S, so they
 * run along the west and east sides; at 90° or 270° they connect E and W, so
 * they run along the north and south sides. Both choices on a side are drawn at
 * random, which varies the direction of `progress` along the loop.
 */
const CORNER_NW: Rotation = 0;
const CORNER_NE: Rotation = 90;
const CORNER_SE: Rotation = 180;
const CORNER_SW: Rotation = 270;

export interface LoopBoard {
  pieces: Piece[];
  /** North-west corner tile (a curve). */
  x0: number;
  z0: number;
  /** Straight-type pieces on each north and south side, and on each west and east side. */
  straightsX: number;
  straightsZ: number;
  /** Id of the station, or null when the loop has none. */
  stationId: string | null;
  /** Centreline length of the whole loop in tiles: 4 × π/4 + 2 × (straightsX + straightsZ). */
  length: number;
}

export interface LoopOptions {
  /** 'always' forces a station (and at least one straight), 'never' forbids it. Default 'maybe'. */
  station?: 'always' | 'maybe' | 'never';
  /** Allow straights to be replaced by tunnels (default true). */
  tunnels?: boolean;
  /** Largest number of straights on one side (default 14, the most that fits). */
  maxStraights?: number;
}

/**
 * Closed rectangular loops: 4 curves at the corners joined by straight-type
 * pieces (0 or more per side, so a 2 × 2 loop of 4 curves is included), at a
 * random position that fits the grid. Optionally one straight becomes the
 * station and some become tunnels. Built through `applyBuild` with explicit
 * rotations and auto-adjust off, in clockwise order from the north-west corner.
 */
export function arbLoop(opts: LoopOptions = {}): fc.Arbitrary<LoopBoard> {
  const stationMode = opts.station ?? 'maybe';
  const allowTunnels = opts.tunnels ?? true;
  const maxStraights = Math.min(14, Math.max(0, opts.maxStraights ?? 14));
  return fc
    .record({
      sx: fc.integer({ min: 0, max: maxStraights }),
      sz: fc.integer({ min: 0, max: maxStraights }),
      fx: fc.nat(),
      fz: fc.nat(),
      withStation:
        stationMode === 'always' ? fc.constant(true) : stationMode === 'never' ? fc.constant(false) : fc.boolean(),
      stationPick: fc.nat(),
      tunnelPicks: allowTunnels ? fc.uniqueArray(fc.nat({ max: 55 }), { maxLength: 4 }) : fc.constant<number[]>([]),
      flips: fc.array(fc.boolean(), { minLength: 56, maxLength: 56 }),
    })
    .filter(({ sx, sz, withStation }) => !withStation || sx + sz > 0)
    .map(({ sx, sz, fx, fz, withStation, stationPick, tunnelPicks, flips }) => {
      const x0 = fx % (15 - sx);
      const z0 = fz % (15 - sz);
      const x1 = x0 + sx + 1;
      const z1 = z0 + sz + 1;

      type Slot = { gridX: number; gridZ: number; corner: Rotation | null; horizontal: boolean };
      const slots: Slot[] = [];
      slots.push({ gridX: x0, gridZ: z0, corner: CORNER_NW, horizontal: true });
      for (let x = x0 + 1; x < x1; x++) slots.push({ gridX: x, gridZ: z0, corner: null, horizontal: true });
      slots.push({ gridX: x1, gridZ: z0, corner: CORNER_NE, horizontal: false });
      for (let z = z0 + 1; z < z1; z++) slots.push({ gridX: x1, gridZ: z, corner: null, horizontal: false });
      slots.push({ gridX: x1, gridZ: z1, corner: CORNER_SE, horizontal: true });
      for (let x = x1 - 1; x > x0; x--) slots.push({ gridX: x, gridZ: z1, corner: null, horizontal: true });
      slots.push({ gridX: x0, gridZ: z1, corner: CORNER_SW, horizontal: false });
      for (let z = z1 - 1; z > z0; z--) slots.push({ gridX: x0, gridZ: z, corner: null, horizontal: false });

      const straightSlots = slots.map((s, i) => (s.corner === null ? i : -1)).filter((i) => i >= 0);
      const stationSlot = withStation ? straightSlots[stationPick % straightSlots.length]! : -1;
      const tunnelSlots = new Set(
        straightSlots.length === 0 ? [] : tunnelPicks.map((k) => straightSlots[k % straightSlots.length]!),
      );

      const requests: BuildRequest[] = slots.map((s, i) => {
        if (s.corner !== null) {
          return { kind: 'place', type: 'curve', gridX: s.gridX, gridZ: s.gridZ, rotation: s.corner, autoAdjust: false };
        }
        const type: TrackType = i === stationSlot ? 'station' : tunnelSlots.has(i) ? 'tunnel' : 'straight';
        const flip = flips[i % flips.length]!;
        const rotation: Rotation = s.horizontal ? (flip ? 270 : 90) : flip ? 180 : 0;
        return { kind: 'place', type, gridX: s.gridX, gridZ: s.gridZ, rotation, autoAdjust: false };
      });

      const { pieces, steps } = applyAccepted(requests);
      if (steps.length !== requests.length) throw new Error('arbLoop: a loop placement was rejected');
      const station = pieces.find((p) => p.type === 'station');
      return {
        pieces,
        x0,
        z0,
        straightsX: sx,
        straightsZ: sz,
        stationId: station ? station.id : null,
        length: Math.PI + 2 * (sx + sz),
      };
    });
}
