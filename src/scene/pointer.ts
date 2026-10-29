// Pointer → tile (D5): a ray–plane intersection with the live camera, so drags that start on
// HTML overlays track the board exactly like pointer moves over the canvas do.
import * as THREE from 'three'
import { worldToTile } from '@/game/grid'
import type { Tile } from '@/game/types'

let camera: THREE.Camera | null = null
let canvas: HTMLCanvasElement | null = null
const raycaster = new THREE.Raycaster()
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ndc = new THREE.Vector2()
const hit = new THREE.Vector3()

export function registerCamera(cam: THREE.Camera | null, el: HTMLCanvasElement | null) {
  camera = cam
  canvas = el
}

/** Ground-plane point under a client position, or null if the ray misses the ground. */
export function clientToGround(clientX: number, clientY: number): THREE.Vector3 | null {
  if (!camera || !canvas) return null
  const rect = canvas.getBoundingClientRect()
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  return raycaster.ray.intersectPlane(ground, hit)
}

export function clientToTile(clientX: number, clientY: number): Tile | null {
  const p = clientToGround(clientX, clientY)
  return p ? worldToTile(p.x, p.z) : null
}

/** True when the canvas itself (not an overlay on top of it) is under the pointer. */
export function clientOverCanvas(clientX: number, clientY: number): boolean {
  if (!canvas) return false
  return document.elementFromPoint(clientX, clientY) === canvas
}

export function setCanvasCursor(cursor: string) {
  if (canvas) canvas.style.cursor = cursor
}
