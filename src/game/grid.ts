import { CATALOG } from './catalog'
import type { Piece, PieceType, Rotation, Side } from './types'

export const GRID_SIZE = 16
export const GRID_HALF = GRID_SIZE / 2

const SIDES: Side[] = ['N', 'E', 'S', 'W']

export const sideDelta: Record<Side, [number, number]> = {
  N: [0, -1],
  E: [1, 0],
  S: [0, 1],
  W: [-1, 0],
}

export const opposite = (side: Side): Side => SIDES[(SIDES.indexOf(side) + 2) % 4]

export const rotateSide = (side: Side, rotation: Rotation): Side =>
  SIDES[(SIDES.indexOf(side) + rotation / 90) % 4]

export const nextRotation = (rotation: Rotation): Rotation =>
  (((rotation + 90) % 360) as Rotation)

export const tileCenter = (gridX: number, gridZ: number) => ({
  x: gridX - GRID_HALF + 0.5,
  z: gridZ - GRID_HALF + 0.5,
})

/** The centre of a piece's footprint, which for a hill is the corner shared by its four tiles. */
export const pieceCenter = (type: PieceType, gridX: number, gridZ: number) => {
  const offset = (CATALOG[type].size - 1) / 2
  const center = tileCenter(gridX, gridZ)
  return { x: center.x + offset, z: center.z + offset }
}

/** The tile containing a ground-plane point, or null off the grid. */
export const worldToTile = (x: number, z: number) => {
  const gridX = Math.floor(x + GRID_HALF)
  const gridZ = Math.floor(z + GRID_HALF)
  return isOnGrid(gridX, gridZ) ? { gridX, gridZ } : null
}

export const isOnGrid = (gridX: number, gridZ: number) =>
  Number.isInteger(gridX) &&
  Number.isInteger(gridZ) &&
  gridX >= 0 &&
  gridX < GRID_SIZE &&
  gridZ >= 0 &&
  gridZ < GRID_SIZE

export const footprint = (type: PieceType, gridX: number, gridZ: number): [number, number][] => {
  const size = CATALOG[type].size
  const cells: [number, number][] = []
  for (let dz = 0; dz < size; dz++) {
    for (let dx = 0; dx < size; dx++) cells.push([gridX + dx, gridZ + dz])
  }
  return cells
}

export const connectorsOf = (piece: Pick<Piece, 'type' | 'rotation'>): Side[] =>
  CATALOG[piece.type].connectors.map((side) => rotateSide(side, piece.rotation))

/** Rotation in radians for three.js: positive y turns anticlockwise from above, ours clockwise. */
export const rotationToYaw = (rotation: number) => (-rotation * Math.PI) / 180
