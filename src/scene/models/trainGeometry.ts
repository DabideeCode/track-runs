/**
 * Procedural geometry for the train: one locomotive and two carriages
 * (task 14.3; Requirements 19.1, 19.2, 29.1, 29.4, 29.5; design.md DD-4,
 * section 7.6, decisions D-15, D-19 and D-37).
 *
 * Coordinates: local to one vehicle. The origin is the vehicle centre on the
 * track centreline at ground level (the pose `x`, `z` from `vehiclePoses`),
 * +y is up and **+z points toward the vehicle's front**, the way the
 * locomotive faces. +x is the vehicle's left side seen from behind, which
 * does not matter because every vehicle is symmetric in x.
 *
 * Mapping a pose to a transform (`TrainView`, task 14.13): set
 * `position = (pose.x, 0, pose.z)` and `rotation.y = vehicleYaw(pose.tangent)`,
 * which is `atan2(tangent.x, tangent.z)`. A Three.js yaw of θ turns local +z
 * into (sin θ, 0, cos θ), so the model's front ends up along the tangent.
 * The pose tangent is the locomotive's facing carried along the track for
 * all three vehicles, so the carriages face the same way as the locomotive
 * in both Forward and Reverse.
 *
 * Envelope (D-37): every part stays inside `TRAIN_CLEARANCE` from
 * `geometry.ts`, |x| ≤ 0.17 and y ≤ 0.5, so the train clears the station
 * furniture (x ≥ 0.18) and is fully enclosed by the tunnel plug. No part
 * reaches below the rail top (`RAIL.height` = 0.08): the wheels rest on it.
 *
 * Lengths along z (Requirement 19.2), magnetic couplers included:
 * locomotive 0.9 (z from −0.45 to 0.45), carriages 0.8 (z from −0.4 to 0.4).
 * With the 0.95 and 0.9 centre spacings in `domain/train.ts` the coupler faces
 * of neighbouring vehicles are 0.1 apart on straight track (D-15).
 *
 * The locomotive front is easy to read: the boiler, chimney, mustard headlamp
 * and mustard buffer beam sit at +z and the cab at −z. Carriages are low
 * boxes with dark window bands, one in sage and one in dusty blue, while the
 * locomotive is terracotta, so the vehicles are clearly distinct.
 *
 * Bevels: boxes are `RoundedBoxGeometry` with radius ≥ 0.02 and cylinders
 * are lathes with rounded or 0.02 chamfered rims (Requirement 29.4). Body,
 * roof and deck ends taper slightly in x, which also reduces the corner
 * contact on back-to-back curves (D-19).
 *
 * Triangle counts at the current settings (checked against
 * `TRAIN_TRIANGLE_BUDGET` by `tests/unit/scene/trainGeometry.test.ts`):
 *
 * | Vehicle     | Triangles | Largest parts                          |
 * | ----------- | --------- | -------------------------------------- |
 * | locomotive  |     1 676 | wheels 384, body 324, trim 312         |
 * | carriage 1  |     1 160 | wheels 384, chassis 216, trim 216      |
 * | carriage 2  |     1 160 | (shares every geometry with carriage 1) |
 * | whole train |     3 996 |                                        |
 *
 * Parts follow the `PiecePart` shape from `geometry.ts`: one geometry and one
 * material spec per part, no two parts of a vehicle sharing a material key,
 * identity transforms (placement is baked into the geometry). The two
 * carriages share every geometry and differ only in the body tint.
 */
import { BufferGeometry } from 'three';
import type { VehicleKind } from '@/domain/train';
import type { Vec2 } from '@/domain/trackPath';
import {
  RAIL,
  cylinderProfile,
  finishGeometry,
  lathe,
  makePart,
  mergeSameMaterial,
  placed,
  roundedBox,
  triangleCount,
  type MaterialSpec,
  type PiecePart,
} from './geometry';
import type { MaterialColourName } from './materials';

export type { VehicleKind } from '@/domain/train';

/** The three vehicles in coupling order (Requirement 19.1). */
export const VEHICLES: readonly VehicleKind[] = ['locomotive', 'carriage1', 'carriage2'];

/** Length of each vehicle along its direction of travel, couplers included (Section 6). */
export const VEHICLE_LENGTH: Readonly<Record<VehicleKind, number>> = {
  locomotive: 0.9,
  carriage1: 0.8,
  carriage2: 0.8,
};

/** Wheels: plastic discs with 0.02 chamfered rims, resting on the rail top. */
export const WHEEL = {
  radius: 0.06,
  thickness: 0.04,
  /** Distance from the centreline to each wheel's mid-plane; the outer face is at 0.165. */
  track: 0.145,
  /** Height of the axle above the ground, so the wheel's lowest point is the rail top. */
  centreY: RAIL.height + 0.06,
  /** Lathe segments; a multiple of 4 puts a vertex exactly at the lowest point. */
  segments: 12,
} as const;

/** Magnetic coupler discs at both ends of every vehicle. */
export const COUPLER = {
  radius: 0.035,
  depth: 0.04,
  centreY: 0.2,
} as const;

/** Axle positions along z for each vehicle. */
export const AXLES: Readonly<Record<VehicleKind, readonly number[]>> = {
  locomotive: [-0.25, 0.22],
  carriage1: [-0.22, 0.22],
  carriage2: [-0.22, 0.22],
};

/** Most triangles each vehicle may draw; about 15% above the counts in the header. */
export const TRAIN_TRIANGLE_BUDGET: Readonly<Record<VehicleKind, number>> = {
  locomotive: 1930,
  carriage1: 1340,
  carriage2: 1340,
};

/** Upper bound for the whole train (locomotive plus both carriages). */
export const TRAIN_TRIANGLE_LIMIT = 5000;

/** Body tint per vehicle. */
export const VEHICLE_TINT: Readonly<Record<VehicleKind, MaterialColourName>> = {
  locomotive: 'terracotta',
  carriage1: 'sage',
  carriage2: 'dustyBlue',
};

/**
 * Yaw (`rotation.y`) that turns a vehicle's local +z onto the pose tangent.
 * Returns 0 for a zero tangent.
 */
export function vehicleYaw(tangent: Vec2): number {
  if (tangent.x === 0 && tangent.z === 0) return 0;
  return Math.atan2(tangent.x, tangent.z);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HALF_PI = Math.PI / 2;

/**
 * Narrows x linearly toward both ends: unchanged for |z| ≤ zStart, scaled by
 * `endScale` at |z| = zEnd. Gives rounded bodies slightly tapered ends.
 */
function taperEnds(geometry: BufferGeometry, zStart: number, zEnd: number, endScale: number): BufferGeometry {
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const az = Math.abs(pos.getZ(i));
    if (az <= zStart) continue;
    const t = Math.min(1, (az - zStart) / (zEnd - zStart));
    pos.setX(i, pos.getX(i) * (1 - (1 - endScale) * t));
  }
  pos.needsUpdate = true;
  return geometry;
}

/** (radius, height) profile of a short cylinder with a 0.02 chamfer on its y1 rim. */
function chamferedDisc(radius: number, y0: number, y1: number): Array<[number, number]> {
  const b = 0.02;
  return [
    [0, y0],
    [radius, y0],
    [radius, y1 - b],
    [radius - b, y1],
    [0, y1],
  ];
}

/** One wheel, axis along x, mid-plane at `x`, resting on the rail top. */
function wheel(x: number, z: number): BufferGeometry {
  const r = WHEEL.radius;
  const h = WHEEL.thickness / 2;
  // Chamfered on both faces: the widest ring is the mid-plane.
  const profile: Array<[number, number]> = [
    [0, -h],
    [r - 0.02, -h],
    [r, 0],
    [r - 0.02, h],
    [0, h],
  ];
  // Rotating the lathe axis (y) about z by 90° turns lathe radius into height,
  // so a lathe vertex at 270° lands exactly at the wheel's lowest point.
  return placed(lathe(profile, WHEEL.segments), {
    position: [x, WHEEL.centreY, z],
    rotation: [0, 0, HALF_PI],
  });
}

function wheelSet(axles: readonly number[]): BufferGeometry {
  return mergeSameMaterial(axles.flatMap((z) => [wheel(WHEEL.track, z), wheel(-WHEEL.track, z)]));
}

/** Magnet discs at both ends; their outer faces are at ±halfLength. */
function couplers(halfLength: number): BufferGeometry {
  // +90° about x maps the lathe axis (y) onto +z and −90° onto −z, so each
  // disc grows outward from its base and its chamfered face is the outer end.
  const disc = (sign: 1 | -1) =>
    placed(lathe(chamferedDisc(COUPLER.radius, 0, COUPLER.depth), 8), {
      position: [0, COUPLER.centreY, sign * (halfLength - COUPLER.depth)],
      rotation: [sign * HALF_PI, 0, 0],
    });
  return mergeSameMaterial([disc(1), disc(-1)]);
}

/** Wooden deck above the wheels plus a narrow underframe between them. */
function chassis(deckLength: number, frameLength: number): BufferGeometry {
  const deck = taperEnds(
    roundedBox([0.32, 0.05, deckLength], 0.02, { position: [0, 0.225, 0] }, 1),
    deckLength / 2 - 0.1,
    deckLength / 2,
    0.9,
  );
  const frame = roundedBox([0.2, 0.08, frameLength], 0.02, { position: [0, 0.16, 0] }, 1);
  return mergeSameMaterial([deck, frame]);
}

const shared = new Map<string, BufferGeometry>();

function sharedGeometry(key: string, build: () => BufferGeometry): BufferGeometry {
  let geometry = shared.get(key);
  if (!geometry) {
    geometry = build();
    shared.set(key, geometry);
  }
  return geometry;
}

const WHEEL_SPEC: MaterialSpec = { family: 'plastic', tint: 'plasticDark' };
const COUPLER_SPEC: MaterialSpec = { family: 'plastic', tint: 'walnutDark' };
const CHASSIS_SPEC: MaterialSpec = { family: 'wood', tint: 'walnut' };
const ROOF_SPEC: MaterialSpec = { family: 'wood', tint: 'birch' };
const TRIM_SPEC: MaterialSpec = { family: 'paint', tint: 'walnutDark' };

// ---------------------------------------------------------------------------
// Locomotive
// ---------------------------------------------------------------------------

/** Where the locomotive's boiler ends at the front (+z). */
const BOILER = { radius: 0.11, centreY: 0.36, zBack: -0.09, zFront: 0.38 } as const;
// (Boiler radius, axis height and z extent; zBack meets the cab's front face.)

function buildLocomotive(): PiecePart[] {
  const half = VEHICLE_LENGTH.locomotive / 2;

  // Boiler: a cylinder along z resting on the deck, rounded at the front.
  const boiler = placed(
    lathe(cylinderProfile(BOILER.radius, BOILER.zBack, BOILER.zFront, 0.02, 0.03), 12),
    { position: [0, BOILER.centreY, 0], rotation: [HALF_PI, 0, 0] },
  );
  const cab = roundedBox([0.3, 0.2, 0.3], 0.03, { position: [0, 0.35, -0.24] }, 1);
  const body = mergeSameMaterial([boiler, cab]);

  const roof = taperEnds(
    roundedBox([0.33, 0.04, 0.36], 0.02, { position: [0, 0.47, -0.24] }, 1),
    0.1,
    0.42,
    0.95,
  );

  // Chimney near the front of the boiler, and dark cab windows on both sides.
  const chimney = placed(lathe(chamferedDisc(0.04, 0.4, 0.495), 12), { position: [0, 0, 0.27] });
  const windows = mergeSameMaterial(
    [0.145, -0.145].map((x) => roundedBox([0.04, 0.08, 0.12], 0.02, { position: [x, 0.38, -0.24] }, 1)),
  );
  const trim = mergeSameMaterial([chimney, windows]);

  // Front marker: headlamp on the smokebox face and a buffer beam below it.
  const lamp = placed(lathe(chamferedDisc(0.04, 0, 0.04), 12), {
    position: [0, BOILER.centreY, BOILER.zFront - 0.01],
    rotation: [HALF_PI, 0, 0],
  });
  const beam = roundedBox([0.26, 0.08, 0.05], 0.02, { position: [0, 0.16, 0.385] }, 1);
  const front = mergeSameMaterial([lamp, beam]);

  return [
    makePart({ name: 'chassis', geometry: chassis(0.82, 0.7), spec: CHASSIS_SPEC }),
    makePart({ name: 'body', geometry: body, spec: { family: 'paint', tint: VEHICLE_TINT.locomotive } }),
    makePart({ name: 'roof', geometry: finishGeometry(roof), spec: ROOF_SPEC }),
    makePart({ name: 'trim', geometry: trim, spec: TRIM_SPEC }),
    makePart({ name: 'front', geometry: front, spec: { family: 'paint', tint: 'mustard' } }),
    makePart({ name: 'wheels', geometry: wheelSet(AXLES.locomotive), spec: WHEEL_SPEC }),
    makePart({ name: 'couplers', geometry: couplers(half), spec: COUPLER_SPEC }),
  ];
}

// ---------------------------------------------------------------------------
// Carriages
// ---------------------------------------------------------------------------

function buildCarriage(kind: 'carriage1' | 'carriage2'): PiecePart[] {
  const half = VEHICLE_LENGTH[kind] / 2;
  const body = sharedGeometry('carriage:body', () =>
    finishGeometry(taperEnds(roundedBox([0.3, 0.17, 0.66], 0.04, { position: [0, 0.335, 0] }, 1), 0.23, 0.33, 0.9)),
  );
  const roof = sharedGeometry('carriage:roof', () =>
    finishGeometry(taperEnds(roundedBox([0.33, 0.045, 0.7], 0.02, { position: [0, 0.4425, 0] }, 1), 0.25, 0.35, 0.9)),
  );
  const windows = sharedGeometry('carriage:windows', () =>
    mergeSameMaterial(
      [0.145, -0.145].map((x) => roundedBox([0.04, 0.07, 0.46], 0.02, { position: [x, 0.355, 0] }, 1)),
    ),
  );
  const frame = sharedGeometry('carriage:chassis', () => chassis(0.72, 0.6));
  const wheels = sharedGeometry('carriage:wheels', () => wheelSet(AXLES[kind]));
  const ends = sharedGeometry('carriage:couplers', () => couplers(half));

  return [
    makePart({ name: 'chassis', geometry: frame, spec: CHASSIS_SPEC }),
    makePart({ name: 'body', geometry: body, spec: { family: 'paint', tint: VEHICLE_TINT[kind] } }),
    makePart({ name: 'roof', geometry: roof, spec: ROOF_SPEC }),
    makePart({ name: 'trim', geometry: windows, spec: TRIM_SPEC }),
    makePart({ name: 'wheels', geometry: wheels, spec: WHEEL_SPEC }),
    makePart({ name: 'couplers', geometry: ends, spec: COUPLER_SPEC }),
  ];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const BUILDERS: Readonly<Record<VehicleKind, () => PiecePart[]>> = {
  locomotive: buildLocomotive,
  carriage1: () => buildCarriage('carriage1'),
  carriage2: () => buildCarriage('carriage2'),
};

const cache = new Map<VehicleKind, readonly PiecePart[]>();

/**
 * The parts of a vehicle, built once and cached. The two carriages share
 * every geometry; only the body material differs.
 */
export function trainPartsFor(kind: VehicleKind): readonly PiecePart[] {
  const build = BUILDERS[kind];
  if (!build) throw new Error(`Unknown vehicle: ${String(kind)}`);
  let parts = cache.get(kind);
  if (!parts) {
    parts = Object.freeze(build());
    cache.set(kind, parts);
  }
  return parts;
}

/** Triangles drawn by one vehicle (all parts). */
export function vehicleTriangleCount(kind: VehicleKind): number {
  return trainPartsFor(kind).reduce((sum, p) => sum + triangleCount(p.geometry), 0);
}

/** Triangles drawn by the whole train. */
export function trainTriangleCount(): number {
  return VEHICLES.reduce((sum, kind) => sum + vehicleTriangleCount(kind), 0);
}

/** Disposes every cached train geometry; the next `trainPartsFor` call rebuilds them. */
export function disposeTrainGeometries(): void {
  const all = new Set<BufferGeometry>(shared.values());
  for (const parts of cache.values()) for (const p of parts) all.add(p.geometry);
  for (const g of all) g.dispose();
  cache.clear();
  shared.clear();
}
