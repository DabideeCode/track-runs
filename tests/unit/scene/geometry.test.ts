/**
 * Unit tests for `src/scene/models/geometry.ts`. Runs in Node: building
 * BufferGeometry and raycasting meshes need no WebGL context.
 *
 * Requirements: 19.7, 19.8, 19.9, 28.3, 28.5 to 28.17, 29.4, 32.1, 32.5
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshBasicMaterial, MeshStandardMaterial, Raycaster, Vector3, type Object3D } from 'three';
import { CATALOGUE, isTrackType, itemOf } from '@/domain/catalogue';
import { localPointAt, localTangentAt, pathLength } from '@/domain/trackPath';
import type { PieceType, TrackType } from '@/domain/types';
import {
  BUFFER_BLOCK,
  CASSETTE,
  HILL_PEAK,
  PIECE_TRIANGLE_LIMIT,
  RAIL,
  TRAIN_CLEARANCE,
  TRIANGLE_BUDGET,
  TUNNEL,
  disposePieceGeometries,
  materialKey,
  partMatrix,
  partsFor,
  pieceTriangleCount,
  triangleCount,
  type PiecePart,
} from '@/scene/models/geometry';
import { MaterialLibrary } from '@/scene/models/materials';

const TYPES: PieceType[] = CATALOGUE.map((item) => item.type);
const TRACK_TYPES = TYPES.filter((t): t is TrackType => isTrackType(t));

afterEach(() => disposePieceGeometries());

function part(type: PieceType, name: string): PiecePart {
  const found = partsFor(type).find((p) => p.name === name);
  if (!found) throw new Error(`${type} has no part ${name}`);
  return found;
}

/** Bounding box of a part in piece-local space, with its transform applied. */
function partBox(p: PiecePart): Box3 {
  const g = p.geometry.clone().applyMatrix4(partMatrix(p));
  g.computeBoundingBox();
  const box = g.boundingBox!.clone();
  g.dispose();
  return box;
}

function pieceBox(type: PieceType): Box3 {
  const box = new Box3();
  for (const p of partsFor(type)) box.union(partBox(p));
  return box;
}

/** A front-side mesh for a part, placed with the part's transform. */
function meshOf(p: PiecePart): Mesh {
  const mesh = new Mesh(p.geometry, new MeshBasicMaterial());
  mesh.position.set(...p.position);
  mesh.rotation.set(...p.rotation);
  mesh.scale.set(...p.scale);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function firstHit(objects: Object3D[], origin: Vector3, direction: Vector3) {
  const ray = new Raycaster(origin, direction.clone().normalize());
  return ray.intersectObjects(objects, false)[0] ?? null;
}

describe('every piece type', () => {
  it.each(TYPES)('%s has named parts with valid, non-empty geometry', (type) => {
    const parts = partsFor(type);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(new Set(parts.map((p) => p.name)).size).toBe(parts.length);
    for (const p of parts) {
      const pos = p.geometry.getAttribute('position');
      const nrm = p.geometry.getAttribute('normal');
      expect(pos.count).toBeGreaterThan(0);
      expect(triangleCount(p.geometry)).toBeGreaterThan(0);
      expect(nrm).toBeDefined();
      expect(p.geometry.getAttribute('uv')).toBeDefined();
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
        const len = Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        expect(len).toBeGreaterThan(0.9);
        expect(len).toBeLessThan(1.1);
      }
    }
  });

  it.each(TYPES)('%s stays inside its footprint and above the ground', (type) => {
    const half = itemOf(type).size / 2;
    const box = pieceBox(type);
    const eps = 1e-6;
    expect(box.min.x).toBeGreaterThanOrEqual(-half - eps);
    expect(box.max.x).toBeLessThanOrEqual(half + eps);
    expect(box.min.z).toBeGreaterThanOrEqual(-half - eps);
    expect(box.max.z).toBeLessThanOrEqual(half + eps);
    expect(box.min.y).toBeGreaterThanOrEqual(-eps);
  });

  it.each(TYPES)('%s uses each shared material once and resolves it from the library', (type) => {
    const lib = new MaterialLibrary({ lowQuality: true });
    const parts = partsFor(type);
    const keys = parts.map((p) => materialKey(p.materialSpec));
    // Parts with the same material are merged into one geometry.
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of parts) {
      const material = p.material(lib);
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(p.material(lib)).toBe(material);
      expect(material.name).toBe(materialKey(p.materialSpec));
    }
    lib.dispose();
  });

  it.each(TYPES)('%s stays within its triangle budget', (type) => {
    const count = pieceTriangleCount(type);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(TRIANGLE_BUDGET[type]);
    expect(TRIANGLE_BUDGET[type]).toBeLessThanOrEqual(PIECE_TRIANGLE_LIMIT);
  });

  it('keeps 100 pieces of the heaviest type under 200 000 triangles', () => {
    const heaviest = Math.max(...TYPES.map(pieceTriangleCount));
    expect(heaviest * 100).toBeLessThan(200_000);
  });
});

describe('track rails', () => {
  /** Height of the rail's top surface at a point, or null where the ray misses. */
  function surfaceHeight(rail: Mesh, x: number, z: number): number | null {
    const hit = firstHit([rail], new Vector3(x, 1, z), new Vector3(0, -1, 0));
    return hit ? hit.point.y : null;
  }

  it.each(TRACK_TYPES)('%s has its two grooves centred on the trackPath centreline', (type) => {
    const rail = meshOf(part(type, 'rail'));
    const length = pathLength(type);
    const top = RAIL.height;
    const floor = RAIL.height - RAIL.grooveDepth;
    const g = RAIL.grooveSpacing / 2; // 0.08
    const gw = RAIL.grooveWidth / 2; // 0.025
    for (let i = 1; i < 10; i++) {
      const s = (length * i) / 10;
      const p = localPointAt(type, s);
      const t = localTangentAt(type, s);
      const right = { x: t.z, z: -t.x };
      const at = (offset: number) => surfaceHeight(rail, p.x + offset * right.x, p.z + offset * right.z);

      expect(at(0)).toBeCloseTo(top, 3);
      for (const side of [-1, 1]) {
        // Groove centre and both sides just inside the groove walls are on the groove floor.
        expect(at(side * g)).toBeCloseTo(floor, 3);
        expect(at(side * (g - gw + 0.006))).toBeCloseTo(floor, 3);
        expect(at(side * (g + gw - 0.006))).toBeCloseTo(floor, 3);
        // Just outside the groove walls is the top surface.
        expect(at(side * (g - gw - 0.006))).toBeCloseTo(top, 3);
        expect(at(side * (g + gw + 0.006))).toBeCloseTo(top, 3);
        // Beyond the bed there is no track.
        expect(at(side * (RAIL.width / 2 + 0.03))).toBeNull();
      }
    }
  });

  it('shares one straight rail geometry between straight, tunnel and station', () => {
    const rail = part('straight', 'rail').geometry;
    expect(part('tunnel', 'rail').geometry).toBe(rail);
    expect(part('station', 'rail').geometry).toBe(rail);
  });

  it('runs each rail between its centreline end points', () => {
    expect(partBox(part('straight', 'rail')).min.z).toBeCloseTo(-0.5, 6);
    expect(partBox(part('straight', 'rail')).max.z).toBeCloseTo(0.5, 6);
    const curve = partBox(part('curve', 'rail'));
    expect(curve.max.z).toBeCloseTo(0.5, 6); // S midpoint
    expect(curve.max.x).toBeCloseTo(0.5, 6); // E midpoint
    const buffer = partBox(part('buffer', 'rail'));
    expect(buffer.max.z).toBeCloseTo(0.5, 6);
    expect(buffer.min.z).toBeCloseTo(BUFFER_BLOCK.zMax, 6);
  });
});

describe('buffer stop', () => {
  it('puts the stop block in the north 0.25 of the tile with its face at the stop face', () => {
    expect(BUFFER_BLOCK.zMax).toBe(-0.25);
    for (const name of ['stopBlock', 'stopBeam']) {
      const box = partBox(part('buffer', name));
      expect(box.min.z).toBeGreaterThanOrEqual(-0.5);
      expect(box.max.z).toBeLessThanOrEqual(-0.25 + 1e-6);
    }
    expect(partBox(part('buffer', 'stopBlock')).max.z).toBeCloseTo(-0.25, 6);
  });
});

describe('tunnel', () => {
  const box = (name: string) => partBox(part('tunnel', name));

  it('has an interior plug from s = 0.2 to s = 0.8 that encloses the train clearance', () => {
    const plug = box('plug');
    expect(plug.min.z).toBeCloseTo(-0.5 + 0.2, 6);
    expect(plug.max.z).toBeCloseTo(0.5 - 0.2, 6);
    expect(plug.min.y).toBeCloseTo(0, 6);
    expect(plug.max.y).toBeGreaterThanOrEqual(TRAIN_CLEARANCE.height);
    expect(-plug.min.x).toBeGreaterThanOrEqual(TRAIN_CLEARANCE.halfWidth);
    expect(plug.max.x).toBeGreaterThanOrEqual(TRAIN_CLEARANCE.halfWidth);
    expect(plug.max.x).toBeLessThan(TUNNEL.innerHalfWidth);
    expect(plug.max.y).toBeLessThan(TUNNEL.innerHeight);
    expect(part('tunnel', 'plug').castShadow).toBe(false);
  });

  it('has a shell covering the tile from opening to opening', () => {
    const shell = box('shell');
    expect(shell.min.z).toBeLessThanOrEqual(-0.48);
    expect(shell.max.z).toBeGreaterThanOrEqual(0.48);
    expect(shell.max.x).toBeCloseTo(TUNNEL.outerHalfWidth, 3);
    expect(shell.max.y).toBeCloseTo(TUNNEL.outerHeight, 3);
  });

  it('shows the plug face through each opening and hides the inside from camera angles', () => {
    const meshes = ['shell', 'plug'].map((name) => meshOf(part('tunnel', name)));
    const plug = meshes[1]!;
    // Looking into each opening along the track, the dark plug face is the first thing hit.
    for (const sign of [1, -1]) {
      const hit = firstHit(meshes, new Vector3(0.05, 0.25, 3 * sign), new Vector3(0, 0, -sign));
      expect(hit?.object).toBe(plug);
      expect(hit!.point.z).toBeCloseTo(0.3 * sign, 4);
    }
    // A point of the train inside the plug region is never the first thing a camera ray reaches.
    const target = new Vector3(0.1, 0.3, 0.15);
    for (const polar of [20, 50, 80]) {
      for (let azimuth = 0; azimuth < 360; azimuth += 30) {
        const p = (polar * Math.PI) / 180;
        const a = (azimuth * Math.PI) / 180;
        const camera = new Vector3(Math.sin(p) * Math.cos(a), Math.cos(p), Math.sin(p) * Math.sin(a))
          .multiplyScalar(6)
          .add(target);
        const hit = firstHit(meshes, camera, target.clone().sub(camera));
        expect(hit).not.toBeNull();
        expect(hit!.distance).toBeLessThan(camera.distanceTo(target) - 0.01);
      }
    }
  });
});

describe('station', () => {
  it('keeps the platform and roof inside the tile and clear of the train corridor', () => {
    for (const name of ['platform', 'posts', 'roof']) {
      const box = partBox(part('station', name));
      expect(box.min.x).toBeGreaterThanOrEqual(TRAIN_CLEARANCE.halfWidth);
      expect(box.max.x).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.min.z)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box.max.z)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('decoration sizes (Requirement 28)', () => {
  it('house, trees and hill have the catalogue heights', () => {
    expect(pieceBox('house').max.y).toBeGreaterThanOrEqual(0.85);
    expect(pieceBox('house').max.y).toBeLessThanOrEqual(1.15);
    expect(pieceBox('pineTree').max.y).toBeGreaterThanOrEqual(1.02);
    expect(pieceBox('pineTree').max.y).toBeLessThanOrEqual(1.38);
    expect(pieceBox('roundTree').max.y).toBeGreaterThanOrEqual(0.85);
    expect(pieceBox('roundTree').max.y).toBeLessThanOrEqual(1.15);
    expect(pieceBox('hill').max.y).toBeCloseTo(HILL_PEAK, 6);
  });

  it('hill peak sits off centre so a rotation is visible', () => {
    const pos = part('hill', 'mound').geometry.getAttribute('position');
    let peak = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getY(i) > pos.getY(peak)) peak = i;
    expect(pos.getX(peak)).toBeGreaterThan(0.1);
    expect(Math.abs(pos.getZ(peak))).toBeLessThan(1e-6);
  });

  it('car is about 0.5 × 0.3 tiles', () => {
    const car = pieceBox('car');
    expect(car.max.x - car.min.x).toBeGreaterThanOrEqual(0.425);
    expect(car.max.x - car.min.x).toBeLessThanOrEqual(0.575);
    expect(car.max.z - car.min.z).toBeGreaterThanOrEqual(0.255);
    expect(car.max.z - car.min.z).toBeLessThanOrEqual(0.345);
  });

  it('cassette is at true scale', () => {
    const cassette = pieceBox('cassette');
    expect(cassette.max.x - cassette.min.x).toBeCloseTo(CASSETTE.length, 3);
    expect(cassette.max.z - cassette.min.z).toBeCloseTo(CASSETTE.width, 3);
    expect(cassette.max.y - cassette.min.y).toBeCloseTo(CASSETTE.height, 2);
    expect(cassette.max.y).toBeLessThanOrEqual(CASSETTE.height);
  });

  it('blocks are 3 stacked lettered blocks', () => {
    const blocks = partsFor('blocks');
    expect(blocks.map((p) => p.materialSpec)).toEqual([
      expect.objectContaining({ family: 'letter', letter: 'A' }),
      expect.objectContaining({ family: 'letter', letter: 'B' }),
      expect.objectContaining({ family: 'letter', letter: 'C' }),
    ]);
    const boxes = blocks.map(partBox);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.min.y).toBeCloseTo(boxes[i - 1]!.max.y, 6);
    }
  });
});

describe('geometry cache', () => {
  it('returns the same parts and geometries on every call', () => {
    for (const type of TYPES) {
      const first = partsFor(type);
      expect(partsFor(type)).toBe(first);
      expect(partsFor(type).map((p) => p.geometry)).toEqual(first.map((p) => p.geometry));
    }
  });

  it('disposes every geometry once and rebuilds on the next call', () => {
    const before = TYPES.map((type) => partsFor(type));
    const geometries = new Set(before.flat().map((p) => p.geometry));
    const disposed = new Map<object, number>();
    for (const g of geometries) g.addEventListener('dispose', () => disposed.set(g, (disposed.get(g) ?? 0) + 1));

    disposePieceGeometries();

    expect(disposed.size).toBe(geometries.size);
    expect([...disposed.values()].every((n) => n === 1)).toBe(true);
    const after = partsFor('straight');
    expect(after).not.toBe(before[0]);
    expect(after[0]!.geometry).not.toBe(before[0]![0]!.geometry);
  });

  it('rejects unknown types', () => {
    expect(() => partsFor('bridge' as PieceType)).toThrow();
  });
});
