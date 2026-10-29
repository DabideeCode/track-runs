import * as THREE from 'three'
import { materials, PALETTE } from '../materials'
import { cyl, mergeParts, rbox, type Part } from './shared'
import { GROOVE_X, RAIL_HEIGHT } from './tracks'

// Vehicles face +Z; origin is the vehicle centre at ground level.
const WHEEL_R = 0.068
const WHEEL_Y = RAIL_HEIGHT + WHEEL_R - 0.01

type Spec = Array<[THREE.BufferGeometry, THREE.Material]>

function wheels(zs: number[]): Spec {
  const out: Spec = []
  for (const z of zs) {
    for (const x of [-GROOVE_X - 0.045, GROOVE_X + 0.045]) {
      out.push([cyl(WHEEL_R, WHEEL_R, 0.04, { x, y: WHEEL_Y, z, rz: Math.PI / 2 }, 18), materials.plastic(PALETTE.charcoal)])
    }
  }
  return out
}

function loco(): Spec {
  return [
    ...wheels([0.27, 0, -0.27]),
    [rbox(0.3, 0.07, 0.86, 0.02, { y: 0.19 }), materials.walnut()],
    [cyl(0.125, 0.125, 0.5, { y: 0.335, z: 0.15, rx: Math.PI / 2 }, 24), materials.paint(PALETTE.terracotta)],
    [cyl(0.1, 0.1, 0.03, { y: 0.335, z: 0.41, rx: Math.PI / 2 }, 24), materials.honey()],
    [rbox(0.32, 0.27, 0.28, 0.03, { y: 0.355, z: -0.27 }), materials.paint(PALETTE.terracotta)],
    [rbox(0.24, 0.1, 0.02, 0.01, { y: 0.4, z: -0.13 }), materials.paint(PALETTE.creamLight)],
    [rbox(0.38, 0.045, 0.34, 0.02, { y: 0.51, z: -0.27 }), materials.honey()],
    [cyl(0.05, 0.04, 0.13, { y: 0.51, z: 0.3 }, 16), materials.walnut()],
    [cyl(0.045, 0.045, 0.05, { y: 0.47, z: 0.08 }, 16), materials.honey()],
    [rbox(0.32, 0.05, 0.04, 0.012, { y: 0.19, z: 0.44 }), materials.honey()],
    [cyl(0.03, 0.03, 0.05, { y: 0.19, z: -0.45, rx: Math.PI / 2 }, 12), materials.plastic(PALETTE.charcoal)],
  ]
}

function carriage(body: string): Spec {
  return [
    ...wheels([0.24, -0.24]),
    [rbox(0.3, 0.07, 0.76, 0.02, { y: 0.19 }), materials.walnut()],
    [rbox(0.32, 0.22, 0.68, 0.035, { y: 0.335 }), materials.paint(body)],
    [rbox(0.325, 0.07, 0.5, 0.012, { y: 0.36 }), materials.paint(PALETTE.creamLight)],
    [rbox(0.36, 0.045, 0.74, 0.02, { y: 0.465 }), materials.honey()],
    [cyl(0.03, 0.03, 0.05, { y: 0.19, z: 0.4, rx: Math.PI / 2 }, 12), materials.plastic(PALETTE.charcoal)],
    [cyl(0.03, 0.03, 0.05, { y: 0.19, z: -0.4, rx: Math.PI / 2 }, 12), materials.plastic(PALETTE.charcoal)],
  ]
}

export type VehicleKind = 'loco' | 'carriageA' | 'carriageB'

const cache = new Map<VehicleKind, Part[]>()
export function getTrainParts(kind: VehicleKind): Part[] {
  let parts = cache.get(kind)
  if (!parts) {
    parts = mergeParts(kind === 'loco' ? loco() : carriage(kind === 'carriageA' ? PALETTE.dusty : PALETTE.sageDeep))
    cache.set(kind, parts)
  }
  return parts
}
