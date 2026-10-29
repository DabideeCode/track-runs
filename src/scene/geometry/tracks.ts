import * as THREE from 'three'
import { BUFFER_END_Z } from '@/game/trackPath'
import { materials, PALETTE } from '../materials'
import { cyl, mergeParts, rbox, ringSector, type Part } from './shared'

// Wooden rail profile (local units = tiles). Real toy track is ~4 cm wide on a 15 cm tile.
export const RAIL_WIDTH = 0.42
export const RAIL_HEIGHT = 0.1
export const GROOVE_X = 0.11
const GROOVE_W = 0.05
const GROOVE_H = 0.012

type Spec = Array<[THREE.BufferGeometry, THREE.Material]>

/** A straight rail from z0 to z1 with two grooves on top. */
function straightRail(z0 = -0.5, z1 = 0.5): Spec {
  const len = z1 - z0
  const zc = (z0 + z1) / 2
  return [
    [rbox(RAIL_WIDTH, RAIL_HEIGHT, len, 0.022, { y: RAIL_HEIGHT / 2, z: zc }), materials.birch()],
    [rbox(GROOVE_W, GROOVE_H, len - 0.02, 0.004, { x: -GROOVE_X, y: RAIL_HEIGHT, z: zc }), materials.groove()],
    [rbox(GROOVE_W, GROOVE_H, len - 0.02, 0.004, { x: GROOVE_X, y: RAIL_HEIGHT, z: zc }), materials.groove()],
  ]
}

function curveRail(): Spec {
  const a0 = Math.PI
  const a1 = Math.PI * 1.5
  const groove = (r: number) => ringSector(0.5, 0.5, r - GROOVE_W / 2, r + GROOVE_W / 2, a0 + 0.02, a1 - 0.02, GROOVE_H)
  const g1 = groove(0.5 - GROOVE_X)
  const g2 = groove(0.5 + GROOVE_X)
  g1.translate(0, RAIL_HEIGHT - GROOVE_H / 2, 0)
  g2.translate(0, RAIL_HEIGHT - GROOVE_H / 2, 0)
  return [
    [ringSector(0.5, 0.5, 0.5 - RAIL_WIDTH / 2, 0.5 + RAIL_WIDTH / 2, a0, a1, RAIL_HEIGHT, 0.018), materials.birch()],
    [g1, materials.groove()],
    [g2, materials.groove()],
  ]
}

/** Arch outline in the x/y plane, extruded along z. */
function archShape(halfWidth: number, wallHeight: number) {
  const s = new THREE.Shape()
  s.moveTo(-halfWidth, 0)
  s.lineTo(-halfWidth, wallHeight)
  s.absarc(0, wallHeight, halfWidth, Math.PI, 0, true)
  s.lineTo(halfWidth, 0)
  s.closePath()
  return s
}

function tunnelShell(): Spec {
  const outer = archShape(0.47, 0.42)
  outer.holes.push(archShape(0.31, 0.3) as unknown as THREE.Path)
  const shell = new THREE.ExtrudeGeometry(outer, {
    depth: 0.86,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.03,
    bevelSegments: 2,
    curveSegments: 20,
  })
  shell.translate(0, 0, -0.43)
  // Wooden portal frames at both openings.
  const frame = (z: number) => {
    const ring = archShape(0.36, 0.3)
    ring.holes.push(archShape(0.3, 0.3) as unknown as THREE.Path)
    const g = new THREE.ExtrudeGeometry(ring, {
      depth: 0.05,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 1,
      curveSegments: 20,
    })
    g.translate(0, 0, z)
    return g
  }
  return [
    [shell, materials.paint(PALETTE.sage)],
    [frame(0.43), materials.honey()],
    [frame(-0.48), materials.honey()],
  ]
}

function station(): Spec {
  const post = (z: number) => cyl(0.028, 0.028, 0.62, { x: 0.41, y: 0.16 + 0.31, z })
  return [
    ...straightRail(),
    [rbox(0.24, 0.16, 0.92, 0.025, { x: 0.36, y: 0.08 }), materials.honey()],
    [post(-0.32), materials.walnut()],
    [post(0.32), materials.walnut()],
    [rbox(0.7, 0.06, 0.84, 0.025, { x: 0.15, y: 0.81 }), materials.paint(PALETTE.terracotta)],
    // Little name board and a bench on the platform.
    [rbox(0.03, 0.12, 0.34, 0.01, { x: 0.46, y: 0.62 }), materials.paint(PALETTE.creamLight)],
    [rbox(0.1, 0.05, 0.3, 0.012, { x: 0.38, y: 0.21 }), materials.paint(PALETTE.dusty)],
  ]
}

function buffer(): Spec {
  const blockFront = BUFFER_END_Z - 0.06
  const blockDepth = 0.5 + blockFront // from z = −0.5 to blockFront
  return [
    ...straightRail(-0.32, 0.5),
    [rbox(0.44, 0.3, blockDepth, 0.03, { y: 0.15, z: -0.5 + blockDepth / 2 }), materials.walnut()],
    [cyl(0.045, 0.045, 0.06, { x: -0.1, y: 0.19, z: blockFront + 0.03, rx: Math.PI / 2 }), materials.paint(PALETTE.terracotta)],
    [cyl(0.045, 0.045, 0.06, { x: 0.1, y: 0.19, z: blockFront + 0.03, rx: Math.PI / 2 }), materials.paint(PALETTE.terracotta)],
  ]
}

export function trackParts(type: 'straight' | 'curve' | 'tunnel' | 'station' | 'buffer'): Part[] {
  switch (type) {
    case 'straight':
      return mergeParts(straightRail())
    case 'curve':
      return mergeParts(curveRail())
    case 'tunnel':
      return mergeParts([...straightRail(), ...tunnelShell()])
    case 'station':
      return mergeParts(station())
    case 'buffer':
      return mergeParts(buffer())
  }
}
