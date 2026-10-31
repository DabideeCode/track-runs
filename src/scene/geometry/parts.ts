import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  ShapeUtils,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceType } from '@/domain/types';
import type { MaterialKey } from './materials';

export interface PiecePart {
  material: MaterialKey;
  geometry: BufferGeometry;
}

export type PieceParts = PiecePart[];

type At = readonly [number, number, number];

export function box(width: number, height: number, depth: number, at: At, radius = 0.02): BufferGeometry {
  const limit = Math.min(width, height, depth) / 2.01;
  const geometry = new RoundedBoxGeometry(width, height, depth, 2, Math.min(radius, limit));
  geometry.translate(...at);
  return geometry;
}

export function cylinder(radiusTop: number, radiusBottom: number, height: number, at: At, segments = 14) {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  geometry.translate(...at);
  return geometry;
}

export function cone(radius: number, height: number, at: At, segments = 16) {
  const geometry = new ConeGeometry(radius, height, segments);
  geometry.translate(...at);
  return geometry;
}

export function sphere(radius: number, at: At, segments = 20) {
  const geometry = new SphereGeometry(radius, segments, Math.round(segments * 0.75));
  geometry.translate(...at);
  return geometry;
}

/** Merges shapes that share a material, so each part is one draw call. */
export function merge(...geometries: BufferGeometry[]): BufferGeometry {
  const prepared = geometries.map((geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
    }
    return flat;
  });
  return mergeGeometries(prepared, false)!;
}

export interface PathPoint {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

/**
 * Sweeps a closed counter-clockwise cross-section along a flat path. Used for the plank of every
 * track, so straight and curved pieces share one profile and join without a visible step.
 */
export function sweep(
  profile: ReadonlyArray<readonly [number, number]>,
  path: (t: number) => PathPoint,
  length: number,
  steps: number,
): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const toWorld = (point: PathPoint, u: number, v: number): [number, number, number] => [
    point.x - point.tz * u,
    v,
    point.z + point.tx * u,
  ];
  const normalAt = (point: PathPoint, nu: number, nv: number): [number, number, number] => [
    -point.tz * nu,
    nv,
    point.tx * nu,
  ];

  let perimeter = 0;
  profile.forEach(([u0, v0], index) => {
    const [u1, v1] = profile[(index + 1) % profile.length]!;
    const size = Math.hypot(u1 - u0, v1 - v0);
    const nu = (v1 - v0) / size;
    const nv = -(u1 - u0) / size;

    for (let step = 0; step < steps; step++) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const p0 = path(t0);
      const p1 = path(t1);
      const a0 = toWorld(p0, u0, v0);
      const b0 = toWorld(p0, u1, v1);
      const a1 = toWorld(p1, u0, v0);
      const b1 = toWorld(p1, u1, v1);
      const n0 = normalAt(p0, nu, nv);
      const n1 = normalAt(p1, nu, nv);
      const uvA0 = [t0 * length * 0.5, perimeter * 0.5];
      const uvB0 = [t0 * length * 0.5, (perimeter + size) * 0.5];
      const uvA1 = [t1 * length * 0.5, perimeter * 0.5];
      const uvB1 = [t1 * length * 0.5, (perimeter + size) * 0.5];
      positions.push(...a0, ...b1, ...b0, ...a0, ...a1, ...b1);
      normals.push(...n0, ...n1, ...n0, ...n0, ...n1, ...n1);
      uvs.push(...uvA0, ...uvB1, ...uvB0, ...uvA0, ...uvA1, ...uvB1);
    }
    perimeter += size;
  });

  const contour = profile.map(([u, v]) => new Vector2(u, v));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const cap = (point: PathPoint, sign: number) => {
    const normal = new Vector3(point.tx * sign, 0, point.tz * sign);
    for (const [ia, ib, ic] of triangles) {
      const corners = [ia!, ib!, ic!].map((i) => toWorld(point, profile[i]![0], profile[i]![1]));
      const [a, b, c] = corners.map((corner) => new Vector3(...corner)) as [Vector3, Vector3, Vector3];
      const facing = b.clone().sub(a).cross(c.clone().sub(a)).dot(normal) > 0;
      const ordered = facing ? [ia!, ib!, ic!] : [ia!, ic!, ib!];
      for (const i of ordered) {
        positions.push(...toWorld(point, profile[i]![0], profile[i]![1]));
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(profile[i]![0] * 0.5, profile[i]![1] * 0.5);
      }
    }
  };
  cap(path(0), -1);
  cap(path(1), 1);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

const cache = new Map<PieceType, PieceParts>();

/** Geometry for one item, built once and shared by every piece of that type. */
export function cachedParts(type: PieceType, build: () => PieceParts): PieceParts {
  let parts = cache.get(type);
  if (!parts) {
    parts = build();
    cache.set(type, parts);
  }
  return parts;
}
