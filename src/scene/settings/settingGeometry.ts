/**
 * Meshes for the two settings: ground surfaces and scale-giving props (task
 * 14.9; design.md DD-4 and section 7.5; Requirements 7.6, 7.7, 7.8, 30.1).
 *
 * Everything is built in code from Three.js primitives (the Section 8
 * fallback), with the shared materials from `MaterialLibrary`, so the props
 * match the toy style of the pieces: matte paint, grained wood, felt and
 * rounded edges.
 *
 * Each `SettingPart` has its world transform baked into its geometry. Parts
 * of one prop that share a material are merged into one geometry, so a
 * setting draws about a dozen meshes. Prop parts stay inside the prop's box
 * from `layout.ts`, so their bounds can be checked in Node.
 *
 * Geometry is cached per setting; `disposeSettingGeometries()` frees it.
 */
import {
  BufferGeometry,
  CircleGeometry,
  Euler,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type MeshStandardMaterial,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { resolveMaterial, type MaterialSpec } from '@/scene/models/geometry';
import type { MaterialColourName, MaterialLibrary } from '@/scene/models/materials';
import {
  BEDROOM_FLOOR,
  BEDROOM_RUG,
  KITCHEN_TABLE,
  SETTING_PROPS,
  type PropId,
  type PropPlacement,
  type SettingId,
  type SurfaceSpec,
} from './layout';

/** Material of a setting part: a piece material, or one of the two ground materials. */
export type SettingMaterialSpec = MaterialSpec | { readonly family: 'floorboards' } | { readonly family: 'tabletop' };

export function settingMaterialKey(spec: SettingMaterialSpec): string {
  switch (spec.family) {
    case 'floorboards':
      return 'floorboards:floorboard';
    case 'tabletop':
      return 'tabletop:tabletop';
    case 'letter':
      return `letter:${spec.letter}:${spec.tint}`;
    default:
      return `${spec.family}:${spec.tint}`;
  }
}

export function resolveSettingMaterial(lib: MaterialLibrary, spec: SettingMaterialSpec): MeshStandardMaterial {
  if (spec.family === 'floorboards') return lib.floorboards();
  if (spec.family === 'tabletop') return lib.tabletop();
  return resolveMaterial(lib, spec);
}

export interface SettingPart {
  /** Unique within the setting, e.g. `floor`, `bedLeg:wood:walnut`. */
  readonly name: string;
  /** The prop this part belongs to, or null for a ground surface. */
  readonly propId: PropId | null;
  /** World-space geometry. */
  readonly geometry: BufferGeometry;
  readonly materialSpec: SettingMaterialSpec;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

/**
 * Raycast handler for every setting mesh: hits nothing, so props and ground
 * never take pointer events or affect placement (Requirement 7.8).
 */
export function noRaycast(): void {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Triple = readonly [number, number, number];

const WOOD = (tint: MaterialColourName): MaterialSpec => ({ family: 'wood', tint });
const PAINT = (tint: MaterialColourName): MaterialSpec => ({ family: 'paint', tint });
const FELT = (tint: MaterialColourName): MaterialSpec => ({ family: 'felt', tint });
const PLASTIC = (tint: MaterialColourName): MaterialSpec => ({ family: 'plastic', tint });

function transform(geometry: BufferGeometry, position: Triple, rotation: Triple = [0, 0, 0], scale: Triple = [1, 1, 1]) {
  geometry.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...position),
      new Quaternion().setFromEuler(new Euler(...rotation)),
      new Vector3(...scale),
    ),
  );
  return geometry;
}

/** A rounded box centred on `position`. */
function box(size: Triple, radius: number, position: Triple, yaw = 0): BufferGeometry {
  return transform(new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius), position, [0, yaw, 0]);
}

/** Lathe around +y from (radius, height) points running outward along the bottom, up and back in. */
function lathe(points: ReadonlyArray<readonly [number, number]>, segments = 24): BufferGeometry {
  const geometry = new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
  geometry.normalizeNormals();
  return geometry;
}

function scaleUv(geometry: BufferGeometry, su: number, sv: number): BufferGeometry {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

function finish(geometry: BufferGeometry): BufferGeometry {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Merges geometries into one non-indexed geometry with position, normal and uv. Inputs are consumed. */
function merge(geometries: BufferGeometry[]): BufferGeometry {
  const prepared = geometries.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(out.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
    }
    out.clearGroups();
    return out;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Could not merge setting geometries');
  for (const g of new Set([...geometries, ...prepared])) g.dispose();
  return finish(merged);
}

interface LocalPart {
  readonly geometry: BufferGeometry;
  readonly spec: MaterialSpec;
}

/** Bakes the prop transform into its local parts and merges parts that share a material. */
function propParts(p: PropPlacement, local: LocalPart[]): SettingPart[] {
  const byMaterial = new Map<string, { spec: MaterialSpec; geometries: BufferGeometry[] }>();
  for (const part of local) {
    transform(part.geometry, [p.x, p.baseY, p.z], [0, p.yaw, 0]);
    const key = settingMaterialKey(part.spec);
    const entry = byMaterial.get(key) ?? { spec: part.spec, geometries: [] };
    entry.geometries.push(part.geometry);
    byMaterial.set(key, entry);
  }
  return [...byMaterial.entries()].map(([key, entry]) => ({
    name: `${p.id}:${key}`,
    propId: p.id,
    geometry: merge(entry.geometries),
    materialSpec: entry.spec,
    castShadow: true,
    receiveShadow: true,
  }));
}

/** A flat ground plane with its top at `topY`. */
function planeSurface(s: SurfaceSpec): BufferGeometry {
  const geometry = new PlaneGeometry(s.width, s.depth);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, s.topY, 0);
  return finish(scaleUv(geometry, s.repeatU, s.repeatV));
}

/** A rounded slab with its top face at `topY`. */
function slabSurface(s: SurfaceSpec, radius: number): BufferGeometry {
  const geometry = new RoundedBoxGeometry(s.width, s.thickness, s.depth, 2, radius);
  geometry.translate(0, s.topY - s.thickness / 2, 0);
  return finish(scaleUv(geometry, s.repeatU, s.repeatV));
}

function surfacePart(name: string, geometry: BufferGeometry, spec: SettingMaterialSpec): SettingPart {
  return { name, propId: null, geometry, materialSpec: spec, castShadow: false, receiveShadow: true };
}

// ---------------------------------------------------------------------------
// Bedroom props (local space: origin at the box centre on the ground, +y up)
// ---------------------------------------------------------------------------

/** A turned walnut bed leg with the corner block of the bed frame on top. */
function bedLeg(): LocalPart[] {
  const leg = lathe([
    [0, 0],
    [0.26, 0],
    [0.3, 0.04],
    [0.3, 0.24],
    [0.24, 0.36],
    [0.2, 0.6],
    [0.18, 1.3],
    [0.24, 1.6],
    [0.27, 1.85],
    [0.3, 2.0],
    [0.3, 2.2],
    [0, 2.2],
  ]);
  const block = box([0.9, 0.5, 0.9], 0.05, [0, 2.45, 0]);
  return [
    { geometry: leg, spec: WOOD('walnut') },
    { geometry: block, spec: WOOD('walnut') },
  ];
}

/** An open honey-wood crate with oak corner posts and a ball peeking out. */
function toyCrate(): LocalPart[] {
  const wood = WOOD('honey');
  const oak = WOOD('oak');
  const parts: LocalPart[] = [
    { geometry: box([2.2, 0.1, 1.6], 0.03, [0, 0.05, 0]), spec: wood },
    { geometry: box([2.04, 1.2, 0.1], 0.03, [0, 0.7, 0.75]), spec: wood },
    { geometry: box([2.04, 1.2, 0.1], 0.03, [0, 0.7, -0.75]), spec: wood },
    { geometry: box([0.1, 1.2, 1.44], 0.03, [1.05, 0.7, 0]), spec: wood },
    { geometry: box([0.1, 1.2, 1.44], 0.03, [-1.05, 0.7, 0]), spec: wood },
    { geometry: transform(new SphereGeometry(0.42, 20, 14), [-0.4, 1.05, 0]), spec: PAINT('terracotta') },
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geometry: box([0.16, 1.3, 0.16], 0.04, [sx * 1.02, 0.65, sz * 0.72]), spec: oak });
    }
  }
  return parts;
}

/** A felt slipper: a birch sole and a rounded toe cap. */
function slipper(): LocalPart[] {
  return [
    { geometry: box([2.8, 0.14, 1.1], 0.05, [0, 0.07, 0]), spec: PAINT('birch') },
    { geometry: box([1.5, 0.36, 1.0], 0.16, [0.55, 0.32, 0]), spec: FELT('terracotta') },
  ];
}

/** Three closed books of falling size, each turned a little. */
function bookStack(): LocalPart[] {
  const books: Array<{ w: number; d: number; yaw: number; tint: 'terracotta' | 'sage' | 'mustard' }> = [
    { w: 1.7, d: 1.3, yaw: 0, tint: 'terracotta' },
    { w: 1.5, d: 1.1, yaw: 0.12, tint: 'sage' },
    { w: 1.3, d: 1.0, yaw: -0.2, tint: 'mustard' },
  ];
  const parts: LocalPart[] = [];
  books.forEach((b, i) => {
    const y0 = i * 0.18;
    const cover = PAINT(b.tint);
    const along = (x: number, y: number, z: number): Triple => {
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      return [x * c + z * s, y, -x * s + z * c];
    };
    parts.push({ geometry: box([b.w, 0.05, b.d], 0.02, along(0, y0 + 0.025, 0), b.yaw), spec: cover });
    parts.push({ geometry: box([b.w, 0.05, b.d], 0.02, along(0, y0 + 0.155, 0), b.yaw), spec: cover });
    parts.push({ geometry: box([0.06, 0.18, b.d], 0.02, along(-b.w / 2 + 0.03, y0 + 0.09, 0), b.yaw), spec: cover });
    parts.push({
      geometry: box([b.w - 0.08, 0.08, b.d - 0.06], 0.02, along(0.01, y0 + 0.09, 0), b.yaw),
      spec: PAINT('birch'),
    });
  });
  return parts;
}

// ---------------------------------------------------------------------------
// Kitchen props
// ---------------------------------------------------------------------------

/** A dusty-blue bowl holding an orange, a lemon and an apple. */
function fruitBowl(): LocalPart[] {
  const bowl = lathe(
    [
      [0, 0],
      [0.5, 0],
      [0.55, 0.06],
      [0.6, 0.12],
      [0.9, 0.25],
      [1.15, 0.5],
      [1.27, 0.72],
      [1.3, 0.78],
      [1.25, 0.81],
      [1.19, 0.75],
      [1.06, 0.52],
      [0.82, 0.32],
      [0.4, 0.21],
      [0, 0.19],
    ],
    32,
  );
  return [
    { geometry: bowl, spec: PAINT('dustyBlue') },
    { geometry: transform(new SphereGeometry(0.42, 20, 14), [-0.35, 0.62, 0.2]), spec: PAINT('terracotta') },
    {
      geometry: transform(new SphereGeometry(0.32, 20, 14), [0.4, 0.6, -0.2], [0, 0.6, 0], [1.3, 1, 1]),
      spec: PAINT('mustard'),
    },
    { geometry: transform(new SphereGeometry(0.4, 20, 14), [0.15, 0.85, 0.35]), spec: PAINT('sage') },
  ];
}

/** A terracotta mug with a handle on +x and coffee inside. */
function mug(): LocalPart[] {
  const body = lathe([
    [0, 0],
    [0.5, 0],
    [0.55, 0.05],
    [0.55, 1.15],
    [0.52, 1.2],
    [0.47, 1.17],
    [0.47, 0.1],
    [0, 0.1],
  ]);
  body.translate(-0.2, 0, 0);
  // Half torus in the x/y plane, bulging toward +x, ends meeting the body wall.
  const handle = transform(new TorusGeometry(0.3, 0.07, 10, 16, Math.PI), [0.35, 0.6, 0], [0, 0, -Math.PI / 2]);
  const coffee = transform(new CircleGeometry(0.47, 24), [-0.2, 0.95, 0], [-Math.PI / 2, 0, 0]);
  return [
    { geometry: body, spec: PAINT('terracotta') },
    { geometry: handle, spec: PAINT('terracotta') },
    { geometry: coffee, spec: PAINT('walnutDark') },
  ];
}

/** A birch salt shaker with a dark plastic cap. */
function saltShaker(): LocalPart[] {
  const body = lathe([
    [0, 0],
    [0.26, 0],
    [0.3, 0.04],
    [0.3, 0.62],
    [0.26, 0.66],
    [0, 0.66],
  ]);
  const cap = lathe([
    [0, 0.64],
    [0.28, 0.64],
    [0.29, 0.7],
    [0.27, 0.8],
    [0.18, 0.9],
    [0.08, 0.94],
    [0, 0.95],
  ]);
  return [
    { geometry: body, spec: WOOD('birch') },
    { geometry: cap, spec: PLASTIC('plasticDark') },
  ];
}

/** A sage cloth napkin folded once. */
function napkin(): LocalPart[] {
  return [
    { geometry: box([2.0, 0.05, 2.0], 0.02, [0, 0.025, 0]), spec: FELT('sage') },
    { geometry: box([1.96, 0.05, 1.0], 0.02, [0, 0.075, -0.48]), spec: FELT('sage') },
  ];
}

const PROP_BUILDERS: Record<PropId, () => LocalPart[]> = {
  bedLeg,
  toyCrate,
  slipper,
  bookStack,
  fruitBowl,
  mug,
  saltShaker,
  napkin,
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function buildBedroom(): SettingPart[] {
  return [
    surfacePart('floor', planeSurface(BEDROOM_FLOOR), { family: 'floorboards' }),
    surfacePart('rug', slabSurface(BEDROOM_RUG, 0.02), { family: 'felt', tint: 'dustyBlue' }),
    ...SETTING_PROPS.bedroom.flatMap((p) => propParts(p, PROP_BUILDERS[p.id]())),
  ];
}

function buildKitchen(): SettingPart[] {
  return [
    surfacePart('tabletop', slabSurface(KITCHEN_TABLE, 0.08), { family: 'tabletop' }),
    ...SETTING_PROPS.kitchen.flatMap((p) => propParts(p, PROP_BUILDERS[p.id]())),
  ];
}

const cache: Partial<Record<SettingId, readonly SettingPart[]>> = {};

/** The cached meshes of a setting: ground surfaces first, then prop parts. */
export function settingParts(setting: SettingId): readonly SettingPart[] {
  return (cache[setting] ??= Object.freeze(setting === 'bedroom' ? buildBedroom() : buildKitchen()));
}

/** Disposes the cached setting geometry (both settings, or one). */
export function disposeSettingGeometries(setting?: SettingId): void {
  const ids: SettingId[] = setting ? [setting] : ['bedroom', 'kitchen'];
  for (const id of ids) {
    for (const part of cache[id] ?? []) part.geometry.dispose();
    delete cache[id];
  }
}
