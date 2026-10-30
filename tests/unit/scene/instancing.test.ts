/**
 * Unit tests for `src/scene/pieces/instancing.ts`. Runs in Node: building
 * instanced meshes and raycasting them needs no WebGL context.
 *
 * Requirements: 14.6, 30.10, 31.9, 32.5, 33.1
 */
import { describe, expect, it } from 'vitest';
import { Box3, InstancedMesh, Matrix4, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { CATALOGUE } from '@/domain/catalogue';
import type { VehiclePose } from '@/domain/train';
import type { Piece, Rotation } from '@/domain/types';
import { partsFor } from '@/scene/models/geometry';
import { MaterialLibrary } from '@/scene/models/materials';
import {
  TRAIN_BLOB_SLOTS,
  blobFootprint,
  blobShadowResources,
  buildPartMeshes,
  openEndPegResources,
  partMeshKey,
  pickAtNdc,
  pickProxyResources,
  pickProxySize,
  pieceBlobMatrix,
  pieceLocalBounds,
  radialGradientData,
  vehicleBlobMatrix,
  writePickProxies,
  writePieceBlobs,
  writeTrainBlobs,
} from '@/scene/pieces/instancing';
import { MAX_PIECES, OPEN_END_PEG, pieceRestTransform } from '@/scene/pieces/pieceLayout';
import { TOKENS } from '@/theme/palette';

const piece = (id: string, type: Piece['type'], gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id,
  type,
  gridX,
  gridZ,
  rotation,
});

describe('buildPartMeshes (Requirement 32.5)', () => {
  const lib = new MaterialLibrary({ lowQuality: false });
  const set = buildPartMeshes(lib);
  const all = { ...set.casters, ...set.receivers };

  it('has a shared mesh for every part of every type', () => {
    for (const item of CATALOGUE) {
      const parts = set.byType[item.type];
      expect(parts.map((p) => p.part)).toEqual([...partsFor(item.type)]);
      for (const { key, part } of parts) {
        const mesh = all[key]!;
        expect(mesh.geometry).toBe(part.geometry);
        expect(mesh.material).toBe(part.material(lib));
        expect(part.castShadow ? set.casters[key] : set.receivers[key]).toBe(mesh);
      }
    }
  });

  it('draws the rail shared by straight, tunnel and station with one instanced mesh', () => {
    const railKey = (t: 'straight' | 'tunnel' | 'station') =>
      set.byType[t].find((p) => p.part.name === 'rail')!.key;
    expect(railKey('tunnel')).toBe(railKey('straight'));
    expect(railKey('station')).toBe(railKey('straight'));
  });

  it('keys meshes by geometry, material and shadow casting', () => {
    for (const [key, mesh] of Object.entries(all)) {
      const owner = CATALOGUE.flatMap((i) => partsFor(i.type)).find((p) => partMeshKey(p) === key)!;
      expect(mesh.geometry).toBe(owner.geometry);
    }
  });

  it('creates no new geometry or material when built again', () => {
    const before = lib.stats();
    const again = buildPartMeshes(lib);
    expect(lib.stats()).toEqual(before);
    for (const [key, mesh] of Object.entries(again.casters)) {
      expect(mesh.geometry).toBe(set.casters[key]!.geometry);
      expect(mesh.material).toBe(set.casters[key]!.material);
    }
  });
});

describe('pick proxies', () => {
  const { geometry, material } = pickProxyResources();

  function topDownPick(pieces: Piece[], x: number, z: number): string | null {
    const mesh = new InstancedMesh(geometry, material, MAX_PIECES);
    writePickProxies(mesh, pieces);
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(x, 20, z + 0.001);
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
    return pickAtNdc(new Raycaster(), camera, { x: 0, y: 0 }, mesh, pieces.map((p) => p.id));
  }

  it('uses a never-rendered material that can still be raycast', () => {
    expect(material.visible).toBe(false);
    expect(topDownPick([piece('a', 'straight', 4, 4)], 4 - 7.5, 4 - 7.5)).toBe('a');
  });

  it('returns null over an empty tile and with no pieces', () => {
    expect(topDownPick([piece('a', 'straight', 4, 4)], 6 - 7.5, 4 - 7.5)).toBeNull();
    expect(topDownPick([], 0, 0)).toBeNull();
  });

  it('picks a hill from any of its 4 tiles', () => {
    const pieces = [piece('h', 'hill', 2, 2, 90), piece('t', 'pineTree', 4, 2)];
    for (const [gx, gz] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3],
    ] as const) {
      expect(topDownPick(pieces, gx - 7.5, gz - 7.5)).toBe('h');
    }
    expect(topDownPick(pieces, 4 - 7.5, 2 - 7.5)).toBe('t');
  });

  it('returns the nearest piece when two proxies are in line', () => {
    const pieces = [piece('far', 'house', 5, 2), piece('near', 'house', 5, 5)];
    const mesh = new InstancedMesh(geometry, material, MAX_PIECES);
    writePickProxies(mesh, pieces);
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    // Looking north along the column from low down in the south.
    camera.position.set(5 - 7.5, 0.5, 12);
    camera.lookAt(5 - 7.5, 0.5, -8);
    expect(pickAtNdc(new Raycaster(), camera, { x: 0, y: 0 }, mesh, ['far', 'near'])).toBe('near');
  });

  it('covers the footprint and the model height', () => {
    for (const item of CATALOGUE) {
      const size = pickProxySize(item.type);
      expect(size.width).toBeLessThanOrEqual(item.size);
      expect(size.width).toBeGreaterThan(item.size * 0.95);
      expect(size.height).toBeGreaterThanOrEqual(pieceLocalBounds(item.type).max.y);
    }
  });
});

describe('blob shadows (Requirements 30.10, 33.1)', () => {
  it('uses the blobShadow palette colour and a soft transparent texture', () => {
    const { material, geometry } = blobShadowResources();
    expect(`#${material.color.getHexString()}`).toBe(TOKENS.blobShadow.hex);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(0, 9);
  });

  it('fades the gradient from opaque at the centre to clear at the edges', () => {
    const size = 32;
    const data = radialGradientData(size);
    const alpha = (i: number, j: number) => data[(j * size + i) * 4 + 3]!;
    expect(alpha(16, 16)).toBeGreaterThan(240);
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(0, 16)).toBeLessThan(5);
    for (let i = 16; i < 31; i++) expect(alpha(i + 1, 16)).toBeLessThanOrEqual(alpha(i, 16));
  });

  it('covers each model’s ground extent for every type and rotation', () => {
    for (const item of CATALOGUE) {
      const local = pieceLocalBounds(item.type);
      for (const r of [0, 90, 180, 270] as const) {
        const p = piece('p', item.type, 6, 6, r);
        const m = pieceBlobMatrix(p);
        const blob = new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 0, 0.5)).applyMatrix4(m);
        const rest = pieceRestTransform(p);
        const model = local
          .clone()
          .applyMatrix4(new Matrix4().makeRotationY(rest.yaw).setPosition(rest.x, 0, rest.z));
        expect(blob.min.x).toBeLessThanOrEqual(model.min.x + 1e-9);
        expect(blob.max.x).toBeGreaterThanOrEqual(model.max.x - 1e-9);
        expect(blob.min.z).toBeLessThanOrEqual(model.min.z + 1e-9);
        expect(blob.max.z).toBeGreaterThanOrEqual(model.max.z - 1e-9);
      }
    }
  });

  it('turns the curve blob with the curve so it stays under the arc', () => {
    const f = blobFootprint('curve');
    expect(f.cx).toBeGreaterThan(0);
    expect(f.cz).toBeGreaterThan(0);
    // At 90° the arc's SE corner turns to SW: offset (cx, cz) → (−cz, cx).
    const pos = new Vector3().setFromMatrixPosition(pieceBlobMatrix(piece('c', 'curve', 6, 6, 90)));
    expect(pos.x).toBeCloseTo(6 - 7.5 - f.cz, 9);
    expect(pos.z).toBeCloseTo(6 - 7.5 + f.cx, 9);
  });

  it('aligns a vehicle blob with its tangent', () => {
    const pose: VehiclePose = { vehicle: 'locomotive', x: 1, z: 2, tangent: { x: 1, z: 0 }, onTrack: true, pieceId: 's' };
    const m = vehicleBlobMatrix(pose);
    const pos = new Vector3().setFromMatrixPosition(m);
    expect(pos.x).toBeCloseTo(1, 9);
    expect(pos.z).toBeCloseTo(2, 9);
    // The blob's long local z axis points along +x.
    const axis = new Vector3(0, 0, 1).transformDirection(m);
    expect(axis.x).toBeCloseTo(1, 6);
    expect(axis.z).toBeCloseTo(0, 6);
  });

  it('puts the train in slots 0 to 2 and the pieces after them', () => {
    const { geometry, material } = blobShadowResources();
    const mesh = new InstancedMesh(geometry, material, MAX_PIECES + TRAIN_BLOB_SLOTS);
    writePieceBlobs(mesh, [piece('a', 'house', 1, 1), piece('b', 'car', 2, 2)]);
    expect(mesh.count).toBe(TRAIN_BLOB_SLOTS + 2);
    writeTrainBlobs(mesh, null);
    const m = new Matrix4();
    const scale = new Vector3();
    for (let i = 0; i < TRAIN_BLOB_SLOTS; i++) {
      mesh.getMatrixAt(i, m);
      scale.setFromMatrixScale(m);
      expect(scale.length()).toBe(0);
    }
    mesh.getMatrixAt(TRAIN_BLOB_SLOTS, m);
    expect(new Vector3().setFromMatrixPosition(m).x).toBeCloseTo(1 - 7.5 + blobFootprint('house').cx, 9);
    expect(mesh.count).toBe(TRAIN_BLOB_SLOTS + 2);
  });
});

describe('open-end pegs (Requirement 14.6)', () => {
  it('is a cream peg 0.18 tiles wide', () => {
    const { geometry, material } = openEndPegResources();
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new Vector3());
    for (const w of [size.x, size.z]) {
      expect(w).toBeLessThanOrEqual(OPEN_END_PEG.width + 1e-6); // Float32 positions
      expect(w).toBeGreaterThan(OPEN_END_PEG.width * 0.95);
    }
    expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(0.25);
    expect(`#${material.color.getHexString()}`).toBe(TOKENS.openEndMarker.hex);
  });
});
