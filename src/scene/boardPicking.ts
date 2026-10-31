import * as THREE from 'three'
import { CATALOG } from '@/game/catalog'
import { pieceCenter, worldToTile } from '@/game/grid'
import type { Piece } from '@/game/types'

interface Board {
  camera: THREE.Camera
  canvas: HTMLCanvasElement
}

let board: Board | null = null

export const attachBoard = (next: Board | null) => {
  board = next
}

export const boardCanvas = () => board?.canvas ?? null

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const hit = new THREE.Vector3()
const box = new THREE.Box3()

const aimRay = (clientX: number, clientY: number) => {
  if (!board) return false
  const rect = board.canvas.getBoundingClientRect()
  pointer.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, board.camera)
  return true
}

/** True when the pointer is on the canvas itself, not over an overlay panel. */
export const isOverCanvas = (clientX: number, clientY: number) =>
  !!board && document.elementFromPoint(clientX, clientY) === board.canvas

/** The grid system: pointer to ground plane to the integer tile under it. */
export const groundPoint = (clientX: number, clientY: number) => {
  if (!aimRay(clientX, clientY)) return null
  if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null
  return { x: hit.x, z: hit.z }
}

export const tileAt = (clientX: number, clientY: number) => {
  const point = groundPoint(clientX, clientY)
  return point ? worldToTile(point.x, point.z) : null
}

/** The nearest piece under the pointer, tested against each piece's bounding box. */
export const pickPiece = (pieces: Piece[], clientX: number, clientY: number) => {
  if (!aimRay(clientX, clientY)) return null
  let best: Piece | null = null
  let bestDistance = Infinity
  for (const piece of pieces) {
    const [halfX, halfZ, height] = CATALOG[piece.type].pick
    const turned = piece.rotation === 90 || piece.rotation === 270
    const hx = turned ? halfZ : halfX
    const hz = turned ? halfX : halfZ
    const { x, z } = pieceCenter(piece.type, piece.gridX, piece.gridZ)
    box.min.set(x - hx, 0, z - hz)
    box.max.set(x + hx, height, z + hz)
    if (!raycaster.ray.intersectBox(box, hit)) continue
    const distance = hit.distanceToSquared(raycaster.ray.origin)
    if (distance < bestDistance) {
      bestDistance = distance
      best = piece
    }
  }
  return best
}
