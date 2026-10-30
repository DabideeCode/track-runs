/**
 * Procedural geometry for the 12 palette pieces (design.md DD-4, DD-5, DD-10,
 * section 7.3; Requirements 19.7, 28.5 to 28.16, 29.4, 34.8, 34.9).
 *
 * Every piece is built in code from Three.js primitives and swept profiles
 * (the Section 8 fallback). There are no model files.
 *
 * Coordinates: local to the piece at rotation 0°, origin at the footprint
 * centre on the ground, +x east, +z south, +y up. One unit is one tile, so a
 * 1 × 1 piece stays inside x, z ∈ [−0.5, 0.5] and the hill inside [−1, 1].
 * The renderer turns a piece with `rotation.y = −rotation × π / 180` about
 * the footprint centre (`rotationToYaw` in `trackPath.ts`).
 *
 * Parts: `partsFor(type)` returns a short list of named parts. Each part has
 * one geometry and one material spec, so drei `<Merged>` can draw one
 * instanced mesh per part (DD-5). Parts of a type that share a material are
 * merged into one geometry, so no two parts of a type share a material key.
 * Most parts bake their placement into the geometry and have an identity
 * transform; parts that share one geometry (the three letter blocks) carry
 * their own position and rotation, applied with `partMatrix(part)`.
 *
 * Track: every rail bed is the same grooved profile swept along the
 * centreline from `trackPath.ts`, so the midpoint between the two grooves is
 * exactly the line the train follows (Requirements 19.8, 19.9, 28.6).
 *
 * Bevels: boxes are `RoundedBoxGeometry` with radius ≥ 0.02, cylinders and
 * cones are lathes with rounded rims, the rail profile has 0.025 rounded top
 * edges and extruded shapes use a 0.02 bevel (Requirement 29.4). Rail ends
 * at tile edges are flat so neighbouring pieces meet without a gap.
 *
 * Triangle counts per piece type at the current settings (checked by
 * `tests/unit/scene/geometry.test.ts` against `TRIANGLE_BUDGET`):
 *
 * | Type        | Triangles |
 * | ----------- | --------- |
 * | straight    |        68 |
 * | curve       |       608 |
 * | tunnel      |       480 |
 * | station     |       788 |
 * | buffer      |       476 |
 * | house       |       980 |
 * | pineTree    |       444 |
 * | roundTree   |       604 |
 * | hill        |       768 |
 * | car         |     1 496 |
 * | cassette    |       334 |
 * | blocks      |       900 |
 *
 * The worst case, 100 cars, is about 150 000 triangles (twice that with the
 * shadow pass), well within an Intel Iris Xe class GPU at 30 fps
 * (Requirement 32.1). Draw calls stay flat because each part is instanced.
 */
import {
  BufferGeometry,
  CircleGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeUtils,
  SphereGeometry,
  Vector2,
  Vector3,
  type MeshStandardMaterial,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isPieceType } from '@/domain/catalogue';
import { BUFFER_STOP_FACE, localPointAt, localTangentAt, pathLength, type Vec2 } from '@/domain/trackPath';
import type { PieceType, TrackType } from '@/domain/types';
import type { BlockLetter, MaterialColourName, MaterialLibrary } from './materials';

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/** Smallest bevel or rounding radius on any outer edge (Requirement 29.4). */
export const MIN_BEVEL = 0.02;

/** Cross-section of the wooden rail bed (design.md section 7.3). */
export const RAIL = {
  /** Full width of the bed, centred on the centreline. */
  width: 0.3,
  /** Height of the bed's top surface above the ground. */
  height: 0.08,
  /** Width of each groove. */
  grooveWidth: 0.05,
  /** Depth of each groove below the top surface. */
  grooveDepth: 0.025,
  /** Distance between the two groove centres; their midpoint is the centreline. */
  grooveSpacing: 0.16,
  /** Radius of the rounded top outer edges. */
  edgeRadius: 0.025,
} as const;

/** Path segments used to sweep the curved rail. */
export const CURVE_SEGMENTS = 16;

/** The buffer's stop block fills the north 0.25 of the tile, up to the stop face. */
export const BUFFER_BLOCK = {
  zMin: -0.47,
  zMax: BUFFER_STOP_FACE,
  halfWidth: 0.2,
  height: 0.22,
} as const;

/**
 * Tunnel shell and interior plug (DD-10). The plug fills the inner clearance
 * of the arch from 0.2 tiles inside one opening to 0.2 tiles inside the
 * other (s = 0.2 to 0.8, z = −0.3 to 0.3), so ordinary depth testing hides
 * the train there from every camera angle (Requirement 19.7).
 */
export const TUNNEL = {
  outerHalfWidth: 0.45,
  outerHeight: 0.64,
  innerHalfWidth: 0.37,
  innerHeight: 0.56,
  /** Height where the straight walls end and the arch begins. */
  springLine: 0.24,
  /** Shell length along the track; slightly under 1 so the bevels show. */
  length: 0.98,
  plugZMin: -0.3,
  plugZMax: 0.3,
  /** Gap between the plug and the shell's inner surface, to avoid z-fighting. */
  plugInset: 0.004,
} as const;

/**
 * Space the train needs around the centreline. Station furniture stays
 * outside it and the tunnel plug encloses it. The train model (task 14.3)
 * must fit inside this envelope.
 */
export const TRAIN_CLEARANCE = {
  halfWidth: 0.17,
  height: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Which shared material a part uses; resolved through a `MaterialLibrary`. */
export type MaterialSpec =
  | { readonly family: 'wood' | 'paint' | 'plastic' | 'felt'; readonly tint: MaterialColourName }
  | { readonly family: 'letter'; readonly letter: BlockLetter; readonly tint: MaterialColourName };

/** Cache key of the material, matching the names `MaterialLibrary` gives its materials. */
export function materialKey(spec: MaterialSpec): string {
  return spec.family === 'letter' ? `letter:${spec.letter}:${spec.tint}` : `${spec.family}:${spec.tint}`;
}

/** The shared material for a spec. */
export function resolveMaterial(lib: MaterialLibrary, spec: MaterialSpec): MeshStandardMaterial {
  switch (spec.family) {
    case 'wood':
      return lib.wood(spec.tint);
    case 'paint':
      return lib.paint(spec.tint);
    case 'plastic':
      return lib.plastic(spec.tint);
    case 'felt':
      return lib.felt(spec.tint);
    case 'letter':
      return lib.letterBlock(spec.letter, spec.tint);
  }
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export type Triple = readonly [number, number, number];

export interface PiecePart {
  /** Unique within its piece type, e.g. `rail`, `shell`, `plug`. */
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly materialSpec: MaterialSpec;
  /** Resolves the shared material from a library (one per quality level). */
  readonly material: (lib: MaterialLibrary) => MeshStandardMaterial;
  /** Transform applied on top of the geometry, in piece-local space. */
  readonly position: Triple;
  /** Euler angles in radians, XYZ order. */
  readonly rotation: Triple;
  readonly scale: Triple;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

interface PartDef {
  name: string;
  geometry: BufferGeometry;
  spec: MaterialSpec;
  position?: Triple;
  rotation?: Triple;
  castShadow?: boolean;
}

const ORIGIN: Triple = [0, 0, 0];
const UNIT: Triple = [1, 1, 1];

function part(def: PartDef): PiecePart {
  const spec = def.spec;
  return Object.freeze({
    name: def.name,
    geometry: def.geometry,
    materialSpec: spec,
    material: (lib: MaterialLibrary) => resolveMaterial(lib, spec),
    position: def.position ?? ORIGIN,
    rotation: def.rotation ?? ORIGIN,
    scale: UNIT,
    castShadow: def.castShadow ?? true,
    receiveShadow: true,
  });
}

/** The part's transform as a matrix (identity for most parts). */
export function partMatrix(p: PiecePart): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...p.position),
    new Quaternion().setFromEuler(new Euler(p.rotation[0], p.rotation[1], p.rotation[2])),
    new Vector3(...p.scale),
  );
}

/** Number of triangles a geometry draws. */
export function triangleCount(geometry: BufferGeometry): number {
  const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
  return Math.floor(count / 3);
}

// ---------------------------------------------------------------------------
// Swept profiles
// ---------------------------------------------------------------------------

/**
 * One point of a closed 2D cross-section: `u` is the offset to the right of
 * the direction of travel, `y` the height. Points run counter-clockwise with
 * u to the right and y up. A point with `normal` is shaded smoothly with
 * that normal (rounded edges); other points take each segment's flat normal.
 */
export interface ProfilePoint {
  readonly u: number;
  readonly y: number;
  readonly normal?: { readonly u: number; readonly y: number };
}

/** A sample of the path at parameter t in [0, 1]: ground point, unit tangent and arc length. */
export interface PathSample {
  readonly point: Vec2;
  readonly tangent: Vec2;
  readonly s: number;
}

/**
 * Sweeps a closed profile along a ground-plane path. The profile's u axis
 * points along `(tangent.z, 0, −tangent.x)`, to the right of travel seen from
 * above. UVs run around the profile (u) and along the path (v), so the wood
 * grain, which runs along v in the texture, follows the track.
 */
export function sweepProfile(
  profile: readonly ProfilePoint[],
  path: (t: number) => PathSample,
  segments: number,
  options: { caps?: boolean } = {},
): BufferGeometry {
  const n = profile.length;
  if (n < 3) throw new Error('A profile needs at least 3 points');
  if (!Number.isInteger(segments) || segments < 1) throw new Error('segments must be a positive integer');

  const segNormals: Array<{ u: number; y: number }> = [];
  const perimeter: number[] = [0];
  for (let k = 0; k < n; k++) {
    const a = profile[k]!;
    const b = profile[(k + 1) % n]!;
    const du = b.u - a.u;
    const dy = b.y - a.y;
    const len = Math.hypot(du, dy);
    if (len === 0) throw new Error('Profile has repeated points');
    segNormals.push({ u: dy / len, y: -du / len });
    perimeter.push(perimeter[k]! + len);
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= segments; j++) {
    const { point, tangent, s } = path(j / segments);
    const lx = tangent.z;
    const lz = -tangent.x;
    for (let k = 0; k < n; k++) {
      for (let e = 0; e < 2; e++) {
        const idx = (k + e) % n;
        const p = profile[idx]!;
        const nrm = p.normal ?? segNormals[k]!;
        positions.push(point.x + p.u * lx, p.y, point.z + p.u * lz);
        normals.push(nrm.u * lx, nrm.y, nrm.u * lz);
        uvs.push(perimeter[k + e]!, s);
      }
    }
  }

  const stride = 2 * n;
  for (let j = 0; j < segments; j++) {
    for (let k = 0; k < n; k++) {
      const a = j * stride + 2 * k;
      const b = a + 1;
      const a2 = a + stride;
      const b2 = b + stride;
      indices.push(a, b, a2, b, b2, a2);
    }
  }

  if (options.caps ?? true) {
    const contour = profile.map((p) => new Vector2(p.u, p.y));
    const tris = ShapeUtils.triangulateShape(contour, []);
    for (const end of [0, segments]) {
      const { point, tangent } = path(end / segments);
      const sign = end === 0 ? -1 : 1;
      const out = { x: tangent.x * sign, z: tangent.z * sign };
      const lx = tangent.z;
      const lz = -tangent.x;
      const base = positions.length / 3;
      for (const p of profile) {
        positions.push(point.x + p.u * lx, p.y, point.z + p.u * lz);
        normals.push(out.x, 0, out.z);
        uvs.push(p.u, p.y);
      }
      for (const [i0, i1, i2] of tris as Array<[number, number, number]>) {
        const v0 = vertexAt(positions, base + i0);
        const v1 = vertexAt(positions, base + i1);
        const v2 = vertexAt(positions, base + i2);
        const faceNormal = v1.sub(v0).cross(v2.sub(v0));
        const facesOut = faceNormal.x * out.x + faceNormal.z * out.z >= 0;
        indices.push(base + i0, facesOut ? base + i1 : base + i2, facesOut ? base + i2 : base + i1);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function vertexAt(positions: readonly number[], i: number): Vector3 {
  return new Vector3(positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]);
}

/** Points on a circular arc from angle a0 to a1 (radians), with radial normals. */
function arc(cu: number, cy: number, r: number, a0: number, a1: number, steps: number): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push({ u: cu + r * c, y: cy + r * s, normal: { u: c, y: s } });
  }
  return out;
}

/**
 * The grooved rail cross-section: 0.30 wide, 0.08 high, two 0.05 × 0.025
 * grooves centred 0.08 either side of the centreline, rounded top edges.
 */
export function railProfile(): ProfilePoint[] {
  const hw = RAIL.width / 2;
  const h = RAIL.height;
  const r = RAIL.edgeRadius;
  const gIn = RAIL.grooveSpacing / 2 - RAIL.grooveWidth / 2; // 0.055
  const gOut = RAIL.grooveSpacing / 2 + RAIL.grooveWidth / 2; // 0.105
  const gy = h - RAIL.grooveDepth; // 0.055
  return [
    { u: -hw, y: 0 },
    { u: hw, y: 0 },
    ...arc(hw - r, h - r, r, 0, Math.PI / 2, 3),
    { u: gOut, y: h },
    { u: gOut, y: gy },
    { u: gIn, y: gy },
    { u: gIn, y: h },
    { u: -gIn, y: h },
    { u: -gIn, y: gy },
    { u: -gOut, y: gy },
    { u: -gOut, y: h },
    ...arc(-hw + r, h - r, r, Math.PI / 2, Math.PI, 3),
  ];
}

/** The centreline of a track type at rotation 0°, as a sweep path. */
export function trackSweepPath(type: TrackType): (t: number) => PathSample {
  const length = pathLength(type);
  return (t) => {
    const s = t * length;
    return { point: localPointAt(type, s), tangent: localTangentAt(type, s), s };
  };
}

function railGeometry(type: TrackType): BufferGeometry {
  return sweepProfile(railProfile(), trackSweepPath(type), type === 'curve' ? CURVE_SEGMENTS : 1);
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

interface Placement {
  position?: Triple;
  rotation?: Triple;
}

/** Applies a placement to a geometry in place and returns it. */
function placed(geometry: BufferGeometry, at: Placement): BufferGeometry {
  const r = at.rotation ?? ORIGIN;
  geometry.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(at.position ?? ORIGIN)),
      new Quaternion().setFromEuler(new Euler(r[0], r[1], r[2])),
      new Vector3(1, 1, 1),
    ),
  );
  return geometry;
}

/** A box with rounded edges, centred on `position`. */
function roundedBox(
  size: Triple,
  radius: number,
  at: Placement = {},
  segments = 2,
): BufferGeometry {
  if (radius < MIN_BEVEL) throw new Error(`Bevel radius ${radius} is below ${MIN_BEVEL}`);
  if (Math.min(...size) < 2 * MIN_BEVEL) throw new Error('Box too thin for the minimum bevel');
  return placed(new RoundedBoxGeometry(size[0], size[1], size[2], segments, radius), at);
}

/** Lathe around the y axis; points are (radius, height) running counter-clockwise. */
function lathe(points: ReadonlyArray<readonly [number, number]>, segments: number): BufferGeometry {
  // Drop repeated points (where two rounded corners meet), which would give zero-length segments.
  const profile: Vector2[] = [];
  for (const [r, y] of points) {
    const last = profile[profile.length - 1];
    if (!last || Math.hypot(last.x - r, last.y - y) > 1e-9) profile.push(new Vector2(r, y));
  }
  const geometry = new LatheGeometry(profile, segments);
  // LatheGeometry averages segment normals without rescaling at some points.
  geometry.normalizeNormals();
  return geometry;
}

/** (radius, height) profile of a cylinder from y0 to y1 with optional rounded rims. */
function cylinderProfile(
  radius: number,
  y0: number,
  y1: number,
  bevelBottom: number,
  bevelTop: number,
): Array<[number, number]> {
  const pts: Array<[number, number]> = [[0, y0]];
  const corner = (cr: number, cy: number, b: number, a0: number, a1: number) => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + ((a1 - a0) * i) / 3;
      pts.push([cr + b * Math.cos(a), cy + b * Math.sin(a)]);
    }
  };
  if (bevelBottom > 0) corner(radius - bevelBottom, y0 + bevelBottom, bevelBottom, -Math.PI / 2, 0);
  else pts.push([radius, y0]);
  if (bevelTop > 0) corner(radius - bevelTop, y1 - bevelTop, bevelTop, 0, Math.PI / 2);
  else pts.push([radius, y1]);
  pts.push([0, y1]);
  return pts;
}

/** Translates and scales a geometry so its bounding box becomes [min, max]. */
function fitToBox(geometry: BufferGeometry, min: Triple, max: Triple): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new Vector3());
  const scale = new Vector3((max[0] - min[0]) / size.x, (max[1] - min[1]) / size.y, (max[2] - min[2]) / size.z);
  geometry.translate(-box.min.x, -box.min.y, -box.min.z);
  geometry.scale(scale.x, scale.y, scale.z);
  geometry.translate(min[0], min[1], min[2]);
  return geometry;
}

/**
 * Merges geometries that share a material into one. Inputs are consumed.
 * Indexed and non-indexed inputs are both accepted.
 */
function merge(geometries: BufferGeometry[]): BufferGeometry {
  if (geometries.length === 1) return finish(geometries[0]!);
  const mixed = geometries.some((g) => g.index === null);
  const prepared = geometries.map((g) => {
    const out = mixed && g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(out.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
    }
    out.clearGroups();
    return out;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Could not merge part geometries');
  for (const g of new Set([...geometries, ...prepared])) g.dispose();
  return finish(merged);
}

function finish(geometry: BufferGeometry): BufferGeometry {
  geometry.clearGroups();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------
// Tunnel
// ---------------------------------------------------------------------------

/** Closed outline of an arch opening (vertical walls, elliptical top), counter-clockwise. */
function archOutline(halfWidth: number, height: number, springLine: number, steps: number): Vector2[] {
  const pts: Vector2[] = [new Vector2(halfWidth, 0)];
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * i) / steps;
    pts.push(new Vector2(halfWidth * Math.cos(a), springLine + (height - springLine) * Math.sin(a)));
  }
  pts.push(new Vector2(-halfWidth, 0));
  return pts;
}

function tunnelShellGeometry(): BufferGeometry {
  const b = MIN_BEVEL;
  // ExtrudeGeometry grows the outline by bevelSize, so build it b smaller all round.
  const outer = archOutline(TUNNEL.outerHalfWidth - b, TUNNEL.outerHeight - b, TUNNEL.springLine, 12);
  const inner = archOutline(TUNNEL.innerHalfWidth + b, TUNNEL.innerHeight + b, TUNNEL.springLine, 12).reverse();
  const shape = new Shape();
  const outline = [...outer, ...inner].map((p) => (p.y === 0 ? new Vector2(p.x, b) : p));
  shape.setFromPoints(outline);
  const depth = TUNNEL.length - 2 * b;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(0, -box.min.y, -(box.min.z + box.max.z) / 2);
  return finish(geometry);
}

function tunnelPlugGeometry(): BufferGeometry {
  const inset = TUNNEL.plugInset;
  const shape = new Shape();
  shape.setFromPoints(
    archOutline(TUNNEL.innerHalfWidth - inset, TUNNEL.innerHeight - inset, TUNNEL.springLine, 12),
  );
  const depth = TUNNEL.plugZMax - TUNNEL.plugZMin;
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, TUNNEL.plugZMin);
  return finish(geometry);
}

// ---------------------------------------------------------------------------
// Piece builders (rotation 0°, local coordinates)
// ---------------------------------------------------------------------------

const RAIL_SPEC: MaterialSpec = { family: 'wood', tint: 'birch' };

const shared = new Map<string, BufferGeometry>();

/** One rail geometry per centreline shape: straight, tunnel and station share it. */
function sharedRail(type: TrackType): BufferGeometry {
  const key = type === 'tunnel' || type === 'station' ? 'rail:straight' : `rail:${type}`;
  let geometry = shared.get(key);
  if (!geometry) {
    geometry = railGeometry(type === 'tunnel' || type === 'station' ? 'straight' : type);
    shared.set(key, geometry);
  }
  return geometry;
}

function buildStraight(): PiecePart[] {
  return [part({ name: 'rail', geometry: sharedRail('straight'), spec: RAIL_SPEC })];
}

function buildCurve(): PiecePart[] {
  return [part({ name: 'rail', geometry: sharedRail('curve'), spec: RAIL_SPEC })];
}

function buildTunnel(): PiecePart[] {
  return [
    part({ name: 'rail', geometry: sharedRail('tunnel'), spec: RAIL_SPEC }),
    part({ name: 'shell', geometry: tunnelShellGeometry(), spec: { family: 'paint', tint: 'sage' } }),
    part({
      name: 'plug',
      geometry: tunnelPlugGeometry(),
      spec: { family: 'paint', tint: 'walnutDark' },
      castShadow: false,
    }),
  ];
}

function buildStation(): PiecePart[] {
  // Platform and canopy on the east side, clear of the train corridor |x| < 0.17.
  const platform = roundedBox([0.3, 0.12, 0.84], 0.03, { position: [0.33, 0.06, 0] });
  const posts = merge(
    [-0.32, 0.32].map((z) =>
      placed(lathe(cylinderProfile(0.03, 0.12, 0.5, 0, 0), 10), { position: [0.42, 0, z] }),
    ),
  );
  const roof = roundedBox([0.31, 0.06, 0.9], 0.025, { position: [0.335, 0.53, 0] });
  return [
    part({ name: 'rail', geometry: sharedRail('station'), spec: RAIL_SPEC }),
    part({ name: 'platform', geometry: finish(platform), spec: { family: 'wood', tint: 'honey' } }),
    part({ name: 'posts', geometry: posts, spec: { family: 'wood', tint: 'walnut' } }),
    part({ name: 'roof', geometry: finish(roof), spec: { family: 'paint', tint: 'terracotta' } }),
  ];
}

function buildBuffer(): PiecePart[] {
  const depth = BUFFER_BLOCK.zMax - BUFFER_BLOCK.zMin;
  const block = roundedBox([2 * BUFFER_BLOCK.halfWidth, BUFFER_BLOCK.height, depth], 0.03, {
    position: [0, BUFFER_BLOCK.height / 2, (BUFFER_BLOCK.zMin + BUFFER_BLOCK.zMax) / 2],
  });
  const beam = roundedBox([0.46, 0.07, 0.1], 0.025, { position: [0, BUFFER_BLOCK.height + 0.035, -0.33] }, 1);
  return [
    part({ name: 'rail', geometry: sharedRail('buffer'), spec: RAIL_SPEC }),
    part({ name: 'stopBlock', geometry: finish(block), spec: { family: 'wood', tint: 'walnut' } }),
    part({ name: 'stopBeam', geometry: finish(beam), spec: { family: 'paint', tint: 'terracotta' } }),
  ];
}

function buildHouse(): PiecePart[] {
  const body = roundedBox([0.62, 0.56, 0.58], 0.03, { position: [0, 0.28, 0] });

  const gable = new Shape();
  gable.setFromPoints([new Vector2(-0.35, 0), new Vector2(0.35, 0), new Vector2(0, 0.44)]);
  const roofPrism = fitToBox(
    new ExtrudeGeometry(gable, {
      depth: 0.62,
      bevelEnabled: true,
      bevelSize: MIN_BEVEL,
      bevelThickness: MIN_BEVEL,
      bevelSegments: 2,
    }),
    [-0.37, 0.54, -0.34],
    [0.37, 1.0, 0.34],
  );
  const chimney = roundedBox([0.1, 0.2, 0.1], 0.02, { position: [0.17, 0.82, -0.08] }, 1);
  const roof = merge([roofPrism, chimney]);

  const door = roundedBox([0.14, 0.24, 0.04], 0.02, { position: [0, 0.12, 0.29] }, 1);
  const windows = merge([
    roundedBox([0.12, 0.12, 0.04], 0.02, { position: [-0.2, 0.34, 0.29] }, 1),
    roundedBox([0.12, 0.12, 0.04], 0.02, { position: [0.2, 0.34, 0.29] }, 1),
    roundedBox([0.04, 0.12, 0.12], 0.02, { position: [0.31, 0.34, 0] }, 1),
    roundedBox([0.04, 0.12, 0.12], 0.02, { position: [-0.31, 0.34, 0] }, 1),
  ]);
  return [
    part({ name: 'body', geometry: finish(body), spec: { family: 'paint', tint: 'mustard' } }),
    part({ name: 'roof', geometry: roof, spec: { family: 'paint', tint: 'terracotta' } }),
    part({ name: 'door', geometry: finish(door), spec: { family: 'paint', tint: 'walnut' } }),
    part({ name: 'windows', geometry: windows, spec: { family: 'paint', tint: 'dustyBlue' } }),
  ];
}

/** Round wooden base disc shared in shape by both trees. */
function treeBase(radius: number): BufferGeometry {
  return finish(lathe(cylinderProfile(radius, 0, 0.05, 0, MIN_BEVEL), 16));
}

function buildPineTree(): PiecePart[] {
  const trunk = lathe(cylinderProfile(0.055, 0.05, 0.32, 0, 0), 10);
  const r = 0.3;
  const y0 = 0.26;
  const top = 1.2;
  const b = 0.025;
  const side = Math.atan2(r, top - y0); // angle of the cone side's outward normal
  const cone: Array<[number, number]> = [[0, y0]];
  for (let i = 0; i <= 3; i++) {
    const a = -Math.PI / 2 + ((side + Math.PI / 2) * i) / 3;
    cone.push([r - b + b * Math.cos(a), y0 + b + b * Math.sin(a)]);
  }
  cone.push([0.02, top - 0.035], [0, top]);
  return [
    part({ name: 'base', geometry: treeBase(0.2), spec: { family: 'wood', tint: 'birch' } }),
    part({ name: 'trunk', geometry: finish(trunk), spec: { family: 'wood', tint: 'walnut' } }),
    part({ name: 'crown', geometry: finish(lathe(cone, 16)), spec: { family: 'wood', tint: 'felt' } }),
  ];
}

function buildRoundTree(): PiecePart[] {
  const stick = lathe(cylinderProfile(0.04, 0.05, 0.5, 0, 0), 10);
  const ball = placed(new SphereGeometry(0.28, 16, 12), { position: [0, 0.72, 0] });
  return [
    part({ name: 'base', geometry: treeBase(0.18), spec: { family: 'wood', tint: 'birch' } }),
    part({ name: 'stick', geometry: finish(stick), spec: { family: 'wood', tint: 'walnut' } }),
    part({ name: 'crown', geometry: finish(ball), spec: { family: 'wood', tint: 'sage' } }),
  ];
}

/** Peak height of the hill above the ground. */
export const HILL_PEAK = 0.6;

function buildHill(): PiecePart[] {
  // Cosine mound, tangent to the ground at its rim, sheared so the peak sits
  // 0.15 east of centre and a rotation of the hill is visible (Requirement 28.17).
  const R = 0.96;
  const steps = 12;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const r = R * (1 - i / steps);
    pts.push([r, (HILL_PEAK * (1 + Math.cos((Math.PI * r) / R))) / 2]);
  }
  const mound = lathe(pts, 32);
  const shear = 0.15 / HILL_PEAK;
  mound.applyMatrix4(new Matrix4().set(1, shear, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  return [part({ name: 'mound', geometry: finish(mound), spec: { family: 'felt', tint: 'felt' } })];
}

function buildCar(): PiecePart[] {
  // Length along x (0.48), width along z (0.30 across the wheels).
  const body = roundedBox([0.48, 0.13, 0.24], 0.04, { position: [0, 0.135, 0] });
  const cabin = roundedBox([0.24, 0.11, 0.2], 0.035, { position: [-0.03, 0.255, 0] });
  const wheels = merge(
    [
      [-0.15, -0.13],
      [0.15, -0.13],
      [-0.15, 0.13],
      [0.15, 0.13],
    ].map(([x, z]) =>
      placed(lathe(cylinderProfile(0.06, -0.02, 0.02, 0.02, 0.02), 14), {
        position: [x!, 0.06, z!],
        rotation: [Math.PI / 2, 0, 0],
      }),
    ),
  );
  return [
    part({ name: 'body', geometry: finish(body), spec: { family: 'paint', tint: 'dustyBlue' } }),
    part({ name: 'cabin', geometry: finish(cabin), spec: { family: 'wood', tint: 'birch' } }),
    part({ name: 'wheels', geometry: wheels, spec: { family: 'plastic', tint: 'plasticDark' } }),
  ];
}

/** True-scale cassette: 0.68 × 0.43 × 0.08 (Requirement 28.15). */
export const CASSETTE = { length: 0.68, width: 0.43, height: 0.08 } as const;

function buildCassette(): PiecePart[] {
  const shellHeight = 0.078;
  const shell = roundedBox([CASSETTE.length, shellHeight, CASSETTE.width], 0.02, {
    position: [0, shellHeight / 2, 0],
  });
  // The label and reel windows are flat decals just above the shell's top face.
  const label = placed(new PlaneGeometry(0.52, 0.24), {
    position: [0, shellHeight + 0.0005, -0.03],
    rotation: [-Math.PI / 2, 0, 0],
  });
  const reels = merge(
    [-0.13, 0.13].map((x) =>
      placed(new CircleGeometry(0.05, 16), {
        position: [x, shellHeight + 0.001, -0.03],
        rotation: [-Math.PI / 2, 0, 0],
      }),
    ),
  );
  return [
    part({ name: 'shell', geometry: finish(shell), spec: { family: 'plastic', tint: 'plasticDark' } }),
    part({ name: 'label', geometry: finish(label), spec: { family: 'paint', tint: 'birch' }, castShadow: false }),
    part({ name: 'reels', geometry: reels, spec: { family: 'paint', tint: 'walnutDark' }, castShadow: false }),
  ];
}

/** Edge length of each letter block. */
export const BLOCK_SIZE = 0.28;

function buildBlocks(): PiecePart[] {
  let cube = shared.get('block');
  if (!cube) {
    cube = finish(roundedBox([BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE], 0.03));
    shared.set('block', cube);
  }
  const s = BLOCK_SIZE;
  const blocks: Array<{ letter: BlockLetter; tint: MaterialColourName; yaw: number }> = [
    { letter: 'A', tint: 'terracotta', yaw: 0 },
    { letter: 'B', tint: 'dustyBlue', yaw: 0.35 },
    { letter: 'C', tint: 'mustard', yaw: -0.25 },
  ];
  return blocks.map(({ letter, tint, yaw }, i) =>
    part({
      name: `block${letter}`,
      geometry: cube,
      spec: { family: 'letter', letter, tint },
      position: [0, s / 2 + i * s, 0],
      rotation: [0, yaw, 0],
    }),
  );
}

const BUILDERS: Readonly<Record<PieceType, () => PiecePart[]>> = {
  straight: buildStraight,
  curve: buildCurve,
  tunnel: buildTunnel,
  station: buildStation,
  buffer: buildBuffer,
  house: buildHouse,
  pineTree: buildPineTree,
  roundTree: buildRoundTree,
  hill: buildHill,
  car: buildCar,
  cassette: buildCassette,
  blocks: buildBlocks,
};

/**
 * Most triangles each piece type may draw. The actual counts are listed in
 * the header comment; the budget leaves about 20% headroom for tuning.
 */
export const TRIANGLE_BUDGET: Readonly<Record<PieceType, number>> = {
  straight: 100,
  curve: 750,
  tunnel: 600,
  station: 950,
  buffer: 580,
  house: 1200,
  pineTree: 540,
  roundTree: 730,
  hill: 930,
  car: 1800,
  cassette: 420,
  blocks: 1100,
};

/** Upper bound for any single piece type, so 100 pieces stay under 200 000 triangles. */
export const PIECE_TRIANGLE_LIMIT = 2000;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = new Map<PieceType, readonly PiecePart[]>();

/**
 * The parts of a piece type at rotation 0°, built once and cached. Every
 * piece of a type shares these geometries (Requirement 32.5).
 */
export function partsFor(type: PieceType): readonly PiecePart[] {
  if (!isPieceType(type)) throw new Error(`Unknown piece type: ${String(type)}`);
  let parts = cache.get(type);
  if (!parts) {
    parts = Object.freeze(BUILDERS[type]());
    cache.set(type, parts);
  }
  return parts;
}

/** Triangles drawn by one piece of a type (all parts). */
export function pieceTriangleCount(type: PieceType): number {
  return partsFor(type).reduce((sum, p) => sum + triangleCount(p.geometry), 0);
}

// Primitive helpers shared with `trainGeometry.ts`.
export {
  part as makePart,
  placed,
  roundedBox,
  lathe,
  cylinderProfile,
  merge as mergeSameMaterial,
  finish as finishGeometry,
};
export type { PartDef, Placement as GeometryPlacement };

/** Disposes every cached piece geometry; the next `partsFor` call rebuilds them. */
export function disposePieceGeometries(): void {
  const all = new Set<BufferGeometry>(shared.values());
  for (const parts of cache.values()) for (const p of parts) all.add(p.geometry);
  for (const g of all) g.dispose();
  cache.clear();
  shared.clear();
}
