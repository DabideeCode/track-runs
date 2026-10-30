/**
 * Consolidated rendering checks (task 14.15). Runs in Node without WebGL:
 * geometry, materials and DataTextures are plain Three.js objects, and the
 * camera values are pure data.
 *
 * The focused files next to this one (geometry, trainGeometry, materials,
 * settings, cameraConfig, instancing) test each module's details. This file
 * checks the rendered result against the acceptance ranges of Requirements 28,
 * 29, 19.2 and 32 as written, across every piece type, the train and both
 * settings at once.
 *
 * Requirements: 7.8, 9.5, 9.6, 9.8, 19.2, 19.7, 28.10, 28.11, 28.12, 28.13,
 * 28.14, 28.15, 29.1, 29.2, 29.3, 32.4, 32.5
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  Box3,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type DataTexture,
  type MeshStandardMaterial,
} from 'three';
import { CATALOGUE } from '@/domain/catalogue';
import type { PieceType } from '@/domain/types';
import { DEFAULT_POSITION, DEFAULT_TARGET } from '@/runtime/cameraPose';
import { applyCameraControlsConfig, cameraControlsConfig, type ConfigurableCameraControls } from '@/scene/cameraConfig';
import {
  TRAIN_CLEARANCE,
  TUNNEL,
  disposePieceGeometries,
  materialKey,
  partMatrix,
  partsFor,
  type PiecePart,
} from '@/scene/models/geometry';
import { MAX_TEXTURE_SIZE, ROUGHNESS, disposeMaterialLibraries, getMaterialLibrary } from '@/scene/models/materials';
import { VEHICLES, VEHICLE_LENGTH, disposeTrainGeometries, trainPartsFor } from '@/scene/models/trainGeometry';
import { clearPieceBoundsCache, pieceLocalBounds } from '@/scene/pieces/instancing';
import { SHADOW_CASTING_LIGHTS, qualityProfile } from '@/scene/quality';
import { GRID_HALF, MAIN_LIGHT, SETTING_PROPS, gridGap, gridReach, isWithinPropBand } from '@/scene/settings/layout';
import { disposeSettingGeometries, resolveSettingMaterial, settingParts } from '@/scene/settings/settingGeometry';

const DEG = Math.PI / 180;
const EPS = 1e-6;
const TYPES: PieceType[] = CATALOGUE.map((item) => item.type);
const SETTINGS = ['bedroom', 'kitchen'] as const;
const QUALITIES = [false, true] as const;

afterAll(() => {
  disposePieceGeometries();
  clearPieceBoundsCache();
  disposeTrainGeometries();
  disposeSettingGeometries();
  disposeMaterialLibraries();
});

/** Bounding box of a part in piece-local space, with its transform applied. */
function partBox(p: PiecePart): Box3 {
  if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
  return p.geometry.boundingBox!.clone().applyMatrix4(partMatrix(p));
}

function unionBox(parts: readonly PiecePart[]): Box3 {
  const box = new Box3();
  for (const p of parts) box.union(partBox(p));
  return box;
}

function families(type: PieceType): Set<string> {
  return new Set(partsFor(type).map((p) => p.materialSpec.family));
}

// ---------------------------------------------------------------------------
// Requirement 28: decoration sizes
// ---------------------------------------------------------------------------

describe('decoration sizes (Requirements 28.10 to 28.15)', () => {
  /** The renderer's model bounds must equal the union of the part boxes. */
  it.each(TYPES)('%s: renderer bounds match its part list and sit on the ground', (type) => {
    const fromParts = unionBox(partsFor(type));
    const rendered = pieceLocalBounds(type);
    expect(rendered.min.distanceTo(fromParts.min)).toBeLessThan(EPS);
    expect(rendered.max.distanceTo(fromParts.max)).toBeLessThan(EPS);
    expect(rendered.min.y).toBeGreaterThanOrEqual(-EPS);
    expect(rendered.min.y).toBeLessThan(0.01);
  });

  const heights: Array<[PieceType, number, number]> = [
    ['house', 0.85, 1.15], // 28.10
    ['pineTree', 1.02, 1.38], // 28.11
    ['roundTree', 0.85, 1.15], // 28.12
    ['hill', 0.51, 0.69], // 28.13 (peak height)
  ];
  it.each(heights)('%s height above the ground is %s to %s tiles', (type, min, max) => {
    const box = pieceLocalBounds(type);
    expect(box.max.y).toBeGreaterThanOrEqual(min);
    expect(box.max.y).toBeLessThanOrEqual(max);
  });

  it('house is a painted block house; trees are wood (28.10 to 28.12)', () => {
    expect(families('house')).toContain('paint');
    for (const t of ['pineTree', 'roundTree'] as const) {
      expect([...families(t)].every((f) => f === 'wood'), t).toBe(true);
    }
  });

  it('hill is a felt or painted mound covering its 2 × 2 footprint (28.13)', () => {
    expect([...families('hill')].every((f) => f === 'felt' || f === 'paint')).toBe(true);
    const box = pieceLocalBounds('hill');
    for (const extent of [box.max.x - box.min.x, box.max.z - box.min.z]) {
      expect(extent).toBeGreaterThanOrEqual(1.8);
      expect(extent).toBeLessThanOrEqual(2 + EPS);
    }
  });

  it('toy car is 0.425 to 0.575 long and 0.255 to 0.345 wide, wood with plastic wheels (28.14)', () => {
    const box = pieceLocalBounds('car');
    const a = box.max.x - box.min.x;
    const b = box.max.z - box.min.z;
    const length = Math.max(a, b);
    const width = Math.min(a, b);
    expect(length).toBeGreaterThanOrEqual(0.425);
    expect(length).toBeLessThanOrEqual(0.575);
    expect(width).toBeGreaterThanOrEqual(0.255);
    expect(width).toBeLessThanOrEqual(0.345);
    expect(families('car')).toContain('wood');
    expect(partsFor('car').find((p) => p.name === 'wheels')?.materialSpec.family).toBe('plastic');
  });

  it('cassette tape is at true scale: 0.68 × 0.43 × 0.08 (28.15)', () => {
    const box = pieceLocalBounds('cassette');
    const a = box.max.x - box.min.x;
    const b = box.max.z - box.min.z;
    expect(Math.abs(Math.max(a, b) - 0.68)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(Math.min(a, b) - 0.43)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(box.max.y - box.min.y - 0.08)).toBeLessThanOrEqual(0.01);
  });
});

// ---------------------------------------------------------------------------
// Requirement 29: matte materials, no reflections
// ---------------------------------------------------------------------------

/** Every part rendered for pieces and the train. */
const RENDERED_PARTS: Array<[string, PiecePart]> = [
  ...TYPES.flatMap((t) => partsFor(t).map((p): [string, PiecePart] => [`${t}:${p.name}`, p])),
  ...VEHICLES.flatMap((v) => trainPartsFor(v).map((p): [string, PiecePart] => [`${v}:${p.name}`, p])),
];

describe('material finish (Requirements 29.1 to 29.3)', () => {
  it.each(QUALITIES)('every piece and train part is matte with no envMap (low quality %s)', (lowQuality) => {
    const lib = getMaterialLibrary(lowQuality);
    const seen = new Set<string>();
    for (const [name, part] of RENDERED_PARTS) {
      const m = part.material(lib);
      const family = part.materialSpec.family;
      seen.add(family);
      expect(m.envMap, name).toBeNull();
      expect(m.metalness, name).toBe(0);
      // letter blocks are painted wood faces, so they follow the paint rule
      if (family === 'wood' || family === 'paint' || family === 'letter') {
        expect(m.roughness, name).toBeGreaterThanOrEqual(0.6);
      } else if (family === 'plastic') {
        expect(m.roughness, name).toBeGreaterThanOrEqual(0.3);
        expect(m.roughness, name).toBeLessThanOrEqual(0.6);
      } else {
        expect(family, name).toBe('felt');
        expect(m.roughness, name).toBeGreaterThanOrEqual(0.6);
      }
    }
    // The checks above really cover each family used by the models.
    for (const f of ['wood', 'paint', 'plastic']) expect(seen).toContain(f);
  });

  it('the train has wooden, painted and plastic parts', () => {
    const used = new Set(VEHICLES.flatMap((v) => trainPartsFor(v).map((p) => p.materialSpec.family)));
    expect(used).toContain('plastic');
    expect(used.has('wood') || used.has('paint')).toBe(true);
    expect(ROUGHNESS.plastic).toBeGreaterThanOrEqual(0.3);
    expect(ROUGHNESS.plastic).toBeLessThanOrEqual(0.6);
  });

  it.each(SETTINGS)('%s surfaces and props add no environment map, so nothing is mirrored', (setting) => {
    const lib = getMaterialLibrary(false);
    for (const part of settingParts(setting)) {
      const m = resolveSettingMaterial(lib, part.materialSpec);
      expect(m.envMap, part.name).toBeNull();
      expect(m.metalness, part.name).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 32.5: one geometry and material set per type; texture limits
// ---------------------------------------------------------------------------

describe('shared geometry and materials (Requirement 32.5)', () => {
  it.each(TYPES)('%s has one geometry and material set, reused for every placed piece', (type) => {
    const lib = getMaterialLibrary(false);
    const parts = partsFor(type);
    const materials = parts.map((p) => p.material(lib));
    // No two parts of a type share a material, so each part is one draw.
    expect(new Set(parts.map((p) => materialKey(p.materialSpec))).size).toBe(parts.length);
    const before = lib.stats();
    // "Placing" 5 more pieces of the type resolves the same objects and creates nothing.
    for (let i = 0; i < 5; i++) {
      const again = partsFor(type);
      again.forEach((p, j) => {
        expect(p.geometry).toBe(parts[j]!.geometry);
        expect(p.material(lib)).toBe(materials[j]);
      });
    }
    expect(lib.stats()).toEqual(before);
  });

  it('the two carriages share every geometry', () => {
    const a = trainPartsFor('carriage1');
    const b = trainPartsFor('carriage2');
    a.forEach((p, i) => expect(p.geometry).toBe(b[i]!.geometry));
  });

  it.each(QUALITIES)('every texture used by a piece, the train or a setting is at most 1024 × 1024 (low %s)', (lowQuality) => {
    const lib = getMaterialLibrary(lowQuality);
    const materials: MeshStandardMaterial[] = [
      ...RENDERED_PARTS.map(([, p]) => p.material(lib)),
      ...SETTINGS.flatMap((s) => settingParts(s).map((p) => resolveSettingMaterial(lib, p.materialSpec))),
    ];
    const textures = new Set(materials.map((m) => m.map).filter((t): t is DataTexture => t !== null));
    expect(textures.size).toBeGreaterThan(0);
    for (const t of textures) {
      const { width, height } = t.image as { width: number; height: number };
      expect(width, t.name).toBeLessThanOrEqual(MAX_TEXTURE_SIZE);
      expect(height, t.name).toBeLessThanOrEqual(MAX_TEXTURE_SIZE);
      expect(MAX_TEXTURE_SIZE).toBe(1024);
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 32.4: one shadow-casting light, shadow map at most 2048
// ---------------------------------------------------------------------------

function sceneSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sceneSources(path);
    return /\.tsx?$/.test(name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('shadow-casting lights (Requirement 32.4)', () => {
  it('the scene declares exactly one light that can cast shadows', () => {
    const src = sceneSources(join(process.cwd(), 'src', 'scene')).join('\n');
    const lights = src.match(/<(directional|point|spot|hemisphere|ambient|rectArea)Light\b[^>]*>/g) ?? [];
    const casters = lights.filter((tag) => /castShadow/.test(tag));
    expect(casters).toHaveLength(SHADOW_CASTING_LIGHTS);
    expect(SHADOW_CASTING_LIGHTS).toBe(1);
    // Point and spot lights would add shadow passes or reflections; none are used.
    expect(lights.some((tag) => /<(point|spot)Light/.test(tag))).toBe(false);
  });

  it('the shadow map is at most 2048 × 2048 in both qualities', () => {
    expect(MAIN_LIGHT.shadowMapSize).toBeLessThanOrEqual(2048);
    for (const low of QUALITIES) expect(qualityProfile(low).shadowMapSize).toBeLessThanOrEqual(2048);
    expect(qualityProfile(true).shadows).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement 7.8: props outside the grid, within 4 units
// ---------------------------------------------------------------------------

describe('setting props (Requirement 7.8)', () => {
  it.each(SETTINGS)('%s: every prop mesh lies entirely outside the grid and within 4 units of it', (setting) => {
    const byProp = new Map<string, Box3>();
    for (const part of settingParts(setting)) {
      if (part.propId === null) continue;
      const box = new Box3().setFromBufferAttribute(part.geometry.getAttribute('position') as never);
      byProp.set(part.propId, (byProp.get(part.propId) ?? new Box3()).union(box));
    }
    expect(byProp.size).toBeGreaterThanOrEqual(2);
    expect(byProp.size).toBe(SETTING_PROPS[setting].length);
    for (const [id, box] of byProp) {
      const b = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
      expect(gridGap(b), id).toBeGreaterThan(0);
      expect(gridReach(b), id).toBeLessThanOrEqual(4);
      expect(isWithinPropBand(b), id).toBe(true);
    }
    expect(GRID_HALF).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Requirement 19.7: tunnel plug; Requirement 19.2: vehicle lengths
// ---------------------------------------------------------------------------

/** True when `p` is inside the closed mesh: rays in two directions cross its surface an odd number of times. */
function isInside(mesh: Mesh, p: Vector3): boolean {
  const directions = [new Vector3(1, 0.013, 0.007), new Vector3(-1, 0.011, -0.009)];
  return directions.every((d) => {
    const hits = new Raycaster(p, d.normalize()).intersectObject(mesh, false);
    return hits.length % 2 === 1;
  });
}

describe('tunnel plug (Requirement 19.7)', () => {
  const plugPart = partsFor('tunnel').find((p) => p.name === 'plug')!;
  const plug = new Mesh(plugPart.geometry, new MeshBasicMaterial({ side: DoubleSide }));
  plug.position.set(...plugPart.position);
  plug.rotation.set(...plugPart.rotation);
  plug.scale.set(...plugPart.scale);
  plug.updateMatrixWorld(true);

  it('spans s = 0.2 to s = 0.8 along the tunnel and is opaque', () => {
    const box = partBox(plugPart);
    // At rotation 0 the centreline runs from z = −0.5 (s = 0) to z = 0.5 (s = 1).
    expect(box.min.z + 0.5).toBeCloseTo(0.2, 6);
    expect(box.max.z + 0.5).toBeCloseTo(0.8, 6);
    expect(TUNNEL.plugZMin).toBe(-0.3);
    expect(TUNNEL.plugZMax).toBe(0.3);
    const m = plugPart.material(getMaterialLibrary(false));
    expect(m.transparent).toBe(false);
    expect(m.opacity).toBe(1);
  });

  it('encloses the train clearance and every vehicle cross-section', () => {
    const corners: Array<[number, number]> = [];
    // The clearance envelope, sampled from the ground to its full height.
    for (const x of [-TRAIN_CLEARANCE.halfWidth, 0, TRAIN_CLEARANCE.halfWidth]) {
      for (const y of [0.01, TRAIN_CLEARANCE.height / 2, TRAIN_CLEARANCE.height]) corners.push([x, y]);
    }
    // The actual vehicle models.
    for (const v of VEHICLES) {
      const box = unionBox(trainPartsFor(v));
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) corners.push([x, y]);
    }
    for (const z of [-0.29, -0.15, 0, 0.15, 0.29]) {
      for (const [x, y] of corners) {
        expect(isInside(plug, new Vector3(x, y, z)), `(${x}, ${y}, ${z})`).toBe(true);
      }
    }
  });

  it('a point beside the plug is reported outside (sanity check of the inside test)', () => {
    expect(isInside(plug, new Vector3(0, 0.3, 0.4))).toBe(false);
    expect(isInside(plug, new Vector3(0.42, 0.3, 0))).toBe(false);
  });
});

describe('vehicle lengths (Requirement 19.2)', () => {
  it.each(VEHICLES)('%s is within ±15% of its nominal length along its direction of travel', (v) => {
    const box = unionBox(trainPartsFor(v));
    const length = box.max.z - box.min.z;
    const [min, max] = v === 'locomotive' ? [0.765, 1.035] : [0.68, 0.92];
    expect(length).toBeGreaterThanOrEqual(min);
    expect(length).toBeLessThanOrEqual(max);
    expect(Math.abs(length - VEHICLE_LENGTH[v])).toBeLessThanOrEqual(0.02);
    // Longer than wide, so the length is the travel axis.
    expect(length).toBeGreaterThan(box.max.x - box.min.x);
  });
});

// ---------------------------------------------------------------------------
// Requirements 9.5, 9.6, 9.8: camera limits and default pose
// ---------------------------------------------------------------------------

describe('camera (Requirements 9.5, 9.6, 9.8)', () => {
  it('limits polar angle to 20° to 80° and distance to 4 to 30, with dolly to cursor off', () => {
    const c = cameraControlsConfig();
    expect(c.minPolarAngle / DEG).toBeCloseTo(20, 9);
    expect(c.maxPolarAngle / DEG).toBeCloseTo(80, 9);
    expect(c.minDistance).toBe(4);
    expect(c.maxDistance).toBe(30);
    expect(c.dollyToCursor).toBe(false);
  });

  it('writes those limits onto the controls', () => {
    const controls: ConfigurableCameraControls & { boundary?: Box3 } = {
      mouseButtons: { left: -1, middle: -1, right: -1, wheel: -1 },
      touches: { one: -1, two: -1, three: -1 },
      minPolarAngle: 0,
      maxPolarAngle: Math.PI,
      minDistance: 0,
      maxDistance: Infinity,
      dollyToCursor: true,
      smoothTime: 0,
      boundaryEnclosesCamera: true,
      boundaryFriction: 1,
      setBoundary(box) {
        this.boundary = box;
      },
    };
    applyCameraControlsConfig(controls);
    expect(controls.minPolarAngle).toBeCloseTo(20 * DEG, 12);
    expect(controls.maxPolarAngle).toBeCloseTo(80 * DEG, 12);
    expect(controls.minDistance).toBe(4);
    expect(controls.maxDistance).toBe(30);
    expect(controls.dollyToCursor).toBe(false);
    expect(controls.boundary?.min.toArray()).toEqual([-8, 0, -8]);
    expect(controls.boundary?.max.toArray()).toEqual([8, 0, 8]);
  });

  it('default pose: target at the origin, distance 18, polar 50°, from the south-east', () => {
    expect(DEFAULT_TARGET).toEqual({ x: 0, y: 0, z: 0 });
    const offset = new Vector3(
      DEFAULT_POSITION.x - DEFAULT_TARGET.x,
      DEFAULT_POSITION.y - DEFAULT_TARGET.y,
      DEFAULT_POSITION.z - DEFAULT_TARGET.z,
    );
    expect(offset.length()).toBeCloseTo(18, 9);
    expect(Math.acos(offset.y / offset.length()) / DEG).toBeCloseTo(50, 9);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.z).toBeGreaterThan(0);
    expect(offset.x).toBeCloseTo(offset.z, 9);
    // About (9.75, 11.57, 9.75), as in design.md section 9.4.
    expect(offset.x).toBeCloseTo(9.75, 2);
    expect(offset.y).toBeCloseTo(11.57, 2);
  });
});
