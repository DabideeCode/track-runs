import { isOnGrid, worldToTile, type Tile } from '@/domain/grid';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Ray {
  origin: Vec3;
  direction: Vec3;
}

/** Where a ray meets the ground plane y = 0, or null if it never does. */
export function rayToGround(ray: Ray): { x: number; z: number } | null {
  if (ray.direction.y >= 0) return null;
  const t = -ray.origin.y / ray.direction.y;
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
}

/** The nearest tile under a ray, or null when it lands off the grid. */
export function rayToTile(ray: Ray): Tile | null {
  const point = rayToGround(ray);
  if (!point) return null;
  const tile = worldToTile(point.x, point.z);
  return isOnGrid(tile) ? tile : null;
}
