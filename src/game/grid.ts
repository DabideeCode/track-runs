import { CATALOGUE } from './catalogue'
import type { Dir, Piece, PieceType, Rotation, Tile } from './types'

export const GRID = 16
const HALF = GRID / 2

const DIRS: Dir[] = ['N', 'E', 'S', 'W']

export function tileCenter(gx: number, gz: number): { x: number; z: number } {
  return { x: gx - HALF + 0.5, z: gz - HALF + 0.5 }
}

/** Nearest tile under a ground-plane point, or null when the point is off the grid. */
export function worldToTile(x: number, z: number): Tile | null {
  const gx = Math.floor(x + HALF)
  const gz = Math.floor(z + HALF)
  return inBounds(gx, gz) ? { gx, gz } : null
}

export function inBounds(gx: number, gz: number): boolean {
  return Number.isInteger(gx) && Number.isInteger(gz) && gx >= 0 && gz >= 0 && gx < GRID && gz < GRID
}

/** Rotate a direction clockwise (viewed from above) by a multiple of 90°. */
export function rotateDir(dir: Dir, rotation: Rotation | number): Dir {
  const steps = (((rotation / 90) % 4) + 4) % 4
  return DIRS[(DIRS.indexOf(dir) + steps) % 4]
}

export function opposite(dir: Dir): Dir {
  return rotateDir(dir, 180)
}

export function dirDelta(dir: Dir): { dx: number; dz: number } {
  switch (dir) {
    case 'N':
      return { dx: 0, dz: -1 }
    case 'E':
      return { dx: 1, dz: 0 }
    case 'S':
      return { dx: 0, dz: 1 }
    case 'W':
      return { dx: -1, dz: 0 }
  }
}

/** World-space connectors of a placed piece, in canonical path order. */
export function pieceConnectors(piece: Pick<Piece, 'type' | 'rotation'>): Dir[] {
  return CATALOGUE[piece.type].connectors.map((d) => rotateDir(d, piece.rotation))
}

/** Tiles covered by a piece anchored at (gx, gz); a 2×2 piece extends east and south. */
export function footprint(type: PieceType, gx: number, gz: number): Tile[] {
  const size = CATALOGUE[type].size
  const tiles: Tile[] = []
  for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) tiles.push({ gx: gx + dx, gz: gz + dz })
  return tiles
}

/** World-space centre of a piece's footprint on the ground. */
export function pieceCenter(piece: Pick<Piece, 'type' | 'gridX' | 'gridZ'>): { x: number; z: number } {
  const c = tileCenter(piece.gridX, piece.gridZ)
  const extra = (CATALOGUE[piece.type].size - 1) / 2
  return { x: c.x + extra, z: c.z + extra }
}

export const tileKey = (gx: number, gz: number) => `${gx},${gz}`
