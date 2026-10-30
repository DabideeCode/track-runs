/**
 * Unit tests for `src/scene/models/trainGeometry.ts`. Runs in Node: building
 * BufferGeometry needs no WebGL context.
 *
 * Requirements: 19.1, 19.2, 19.7, 29.1, 29.2, 29.3, 29.4, 32.5
 */
import { afterEach, describe, expect, it } from 'vitest';
import { Box3, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { CARRIAGE_LENGTH, LOCO_LENGTH } from '@/domain/train';
import { RAIL, TRAIN_CLEARANCE, materialKey, type PiecePart } from '@/scene/models/geometry';
import { MaterialLibrary, ROUGHNESS } from '@/scene/models/materials';
import {
  AXLES,
  TRAIN_TRIANGLE_BUDGET,
  TRAIN_TRIANGLE_LIMIT,
  VEHICLES,
  VEHICLE_LENGTH,
  WHEEL,
  disposeTrainGeometries,
  trainPartsFor,
  trainTriangleCount,
  vehicleTriangleCount,
  vehicleYaw,
  type VehicleKind,
} from '@/scene/models/trainGeometry';

const EPS = 1e-6;

afterEach(() => disposeTrainGeometries());

function part(kind: VehicleKind, name: string): PiecePart {
  const found = trainPartsFor(kind).find((p) => p.name === name);
  if (!found) throw new Error(`${kind} has no part ${name}`);
  return found;
}

function partBox(p: PiecePart): Box3 {
  p.geometry.computeBoundingBox();
  return p.geometry.boundingBox!.clone();
}

function vehicleBox(kind: VehicleKind): Box3 {
  const box = new Box3();
  for (const p of trainPartsFor(kind)) box.union(partBox(p));
  return box;
}

describe('train consist', () => {
  it('has a locomotive and two carriages in coupling order', () => {
    expect(VEHICLES).toEqual(['locomotive', 'carriage1', 'carriage2']);
  });

  it('matches the simulation vehicle lengths', () => {
    expect(VEHICLE_LENGTH.locomotive).toBe(LOCO_LENGTH);
    expect(VEHICLE_LENGTH.carriage1).toBe(CARRIAGE_LENGTH);
    expect(VEHICLE_LENGTH.carriage2).toBe(CARRIAGE_LENGTH);
  });
});

describe.each(VEHICLES)('%s geometry', (kind) => {
  it('has the required length along z, centred on the origin', () => {
    const box = vehicleBox(kind);
    const expected = kind === 'locomotive' ? 0.9 : 0.8;
    expect(Math.abs(box.max.z - box.min.z - expected)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(box.max.z + box.min.z)).toBeLessThan(EPS);
  });

  it('keeps every part inside the train clearance and above the rail top', () => {
    for (const p of trainPartsFor(kind)) {
      const box = partBox(p);
      expect(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), p.name).toBeLessThanOrEqual(
        TRAIN_CLEARANCE.halfWidth + EPS,
      );
      expect(box.max.y, p.name).toBeLessThanOrEqual(TRAIN_CLEARANCE.height + EPS);
      expect(box.min.y, p.name).toBeGreaterThanOrEqual(RAIL.height - EPS);
    }
  });

  it('has wheels whose lowest points rest on the rail top', () => {
    const wheels = part(kind, 'wheels');
    expect(partBox(wheels).min.y).toBeCloseTo(RAIL.height, 6);
    const pos = wheels.geometry.getAttribute('position');
    for (const axle of AXLES[kind]) {
      for (const side of [1, -1]) {
        let lowest = Infinity;
        for (let i = 0; i < pos.count; i++) {
          if (Math.abs(pos.getZ(i) - axle) > WHEEL.radius + EPS) continue;
          if (Math.sign(pos.getX(i)) !== side) continue;
          lowest = Math.min(lowest, pos.getY(i));
        }
        expect(lowest, `axle ${axle} side ${side}`).toBeCloseTo(RAIL.height, 6);
      }
    }
  });

  it('has magnetic couplers at both ends', () => {
    const box = partBox(part(kind, 'couplers'));
    const half = VEHICLE_LENGTH[kind] / 2;
    expect(box.max.z).toBeCloseTo(half, 6);
    expect(box.min.z).toBeCloseTo(-half, 6);
  });

  it('resolves every part to a shared matte material from the library', () => {
    const lib = new MaterialLibrary({ lowQuality: false });
    const keys = new Set<string>();
    for (const p of trainPartsFor(kind)) {
      const material = p.material(lib);
      expect(material).toBeInstanceOf(MeshStandardMaterial);
      expect(material).toBe(p.material(lib));
      expect(material.name).toBe(materialKey(p.materialSpec));
      expect(material.metalness).toBe(0);
      expect(material.envMap).toBeNull();
      const family = p.materialSpec.family;
      if (family === 'wood' || family === 'paint') expect(material.roughness).toBeGreaterThanOrEqual(0.6);
      if (family === 'plastic') expect(material.roughness).toBe(ROUGHNESS.plastic);
      keys.add(materialKey(p.materialSpec));
    }
    // No two parts of a vehicle share a material, so each part is one instanced draw.
    expect(keys.size).toBe(trainPartsFor(kind).length);
    lib.dispose();
  });

  it('has finite positions and normals', () => {
    for (const p of trainPartsFor(kind)) {
      for (const name of ['position', 'normal']) {
        const array = p.geometry.getAttribute(name).array;
        expect(Array.from(array).every(Number.isFinite), `${p.name} ${name}`).toBe(true);
      }
    }
  });

  it('stays within its triangle budget', () => {
    expect(vehicleTriangleCount(kind)).toBeLessThanOrEqual(TRAIN_TRIANGLE_BUDGET[kind]);
  });
});

describe('locomotive front', () => {
  it('puts the front marker at the +z end and the cab toward −z', () => {
    const front = partBox(part('locomotive', 'front'));
    expect(front.min.z).toBeGreaterThan(0.3);
    expect(front.max.z).toBeLessThanOrEqual(VEHICLE_LENGTH.locomotive / 2 + EPS);
    const roof = partBox(part('locomotive', 'roof'));
    expect((roof.min.z + roof.max.z) / 2).toBeLessThan(0);
    const trim = partBox(part('locomotive', 'trim'));
    // The chimney is the highest trim point and sits in the front half.
    expect(trim.max.y).toBeGreaterThan(0.45);
  });
});

describe('vehicle looks', () => {
  it('gives the three vehicles distinct body colours', () => {
    const tints = VEHICLES.map((kind) => materialKey(part(kind, 'body').materialSpec));
    expect(new Set(tints).size).toBe(3);
  });

  it('gives the locomotive parts the carriages lack', () => {
    const names = (kind: VehicleKind) => trainPartsFor(kind).map((p) => p.name);
    expect(names('locomotive')).toContain('front');
    expect(names('carriage1')).not.toContain('front');
  });
});

describe('triangle budget', () => {
  it('keeps the whole train well under the limit', () => {
    const total = trainTriangleCount();
    expect(total).toBe(VEHICLES.reduce((sum, k) => sum + vehicleTriangleCount(k), 0));
    expect(total).toBeLessThanOrEqual(TRAIN_TRIANGLE_LIMIT);
  });
});

describe('caching and disposal', () => {
  it('returns the same parts on every call', () => {
    expect(trainPartsFor('locomotive')).toBe(trainPartsFor('locomotive'));
  });

  it('shares every carriage geometry between the two carriages', () => {
    const a = trainPartsFor('carriage1');
    const b = trainPartsFor('carriage2');
    expect(a.map((p) => p.geometry)).toEqual(b.map((p) => p.geometry));
    a.forEach((p, i) => expect(p.geometry).toBe(b[i]!.geometry));
  });

  it('disposes every cached geometry and rebuilds on the next call', () => {
    const before = VEHICLES.flatMap((kind) => trainPartsFor(kind).map((p) => p.geometry));
    const disposed = new Set<unknown>();
    for (const g of before) g.addEventListener('dispose', () => disposed.add(g));
    disposeTrainGeometries();
    expect(disposed.size).toBe(new Set(before).size);
    const after = trainPartsFor('locomotive');
    expect(after[0]!.geometry).not.toBe(before[0]);
  });

  it('rejects an unknown vehicle', () => {
    expect(() => trainPartsFor('tender' as VehicleKind)).toThrow();
  });
});

describe('vehicleYaw', () => {
  it('turns the model front (+z) onto the pose tangent', () => {
    const tangents = [
      { x: 0, z: 1 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: -1, z: 0 },
      { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
    ];
    for (const t of tangents) {
      const o = new Object3D();
      o.rotation.y = vehicleYaw(t);
      const front = new Vector3(0, 0, 1).applyQuaternion(o.quaternion);
      expect(front.x).toBeCloseTo(t.x, 9);
      expect(front.z).toBeCloseTo(t.z, 9);
    }
  });

  it('returns 0 for a zero tangent', () => {
    expect(vehicleYaw({ x: 0, z: 0 })).toBe(0);
  });
});
