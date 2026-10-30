export const GRID_SIZE = 16;
const HALF_GRID = GRID_SIZE / 2;

export function tileToWorld(gridX: number, gridZ: number) {
  return { x: gridX - 7.5, z: gridZ - 7.5 };
}

export function isOnGrid(gridX: number, gridZ: number): boolean {
  return (
    Number.isInteger(gridX) &&
    Number.isInteger(gridZ) &&
    gridX >= 0 &&
    gridX < GRID_SIZE &&
    gridZ >= 0 &&
    gridZ < GRID_SIZE
  );
}

export function worldToTile(x: number, z: number): { x: number; z: number } | null {
  const gridX = Math.floor(x + HALF_GRID);
  const gridZ = Math.floor(z + HALF_GRID);
  return isOnGrid(gridX, gridZ) ? { x: gridX, z: gridZ } : null;
}
