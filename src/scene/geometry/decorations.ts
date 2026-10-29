import * as THREE from 'three'
import type { DecorationType } from '@/game/types'
import { materials, PALETTE } from '../materials'
import { cyl, lathe, mergeParts, place, rbox, type Part } from './shared'

type Spec = Array<[THREE.BufferGeometry, THREE.Material]>

function house(): Spec {
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-0.38, 0)
  roofShape.lineTo(0, 0.34)
  roofShape.lineTo(0.38, 0)
  roofShape.closePath()
  const roof = new THREE.ExtrudeGeometry(roofShape, {
    depth: 0.62,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 2,
  })
  roof.translate(0, 0.5, -0.31)
  const windowGeo = (x: number) => rbox(0.12, 0.12, 0.02, 0.01, { x, y: 0.33, z: 0.29 })
  return [
    [rbox(0.62, 0.5, 0.56, 0.035, { y: 0.25 }), materials.paint(PALETTE.cream)],
    [roof, materials.paint(PALETTE.terracotta)],
    [rbox(0.1, 0.2, 0.1, 0.02, { x: 0.18, y: 0.78, z: -0.08 }), materials.honey()],
    [rbox(0.14, 0.24, 0.02, 0.012, { x: -0.13, y: 0.12, z: 0.285 }), materials.paint(PALETTE.dustyDeep)],
    [windowGeo(0.14), materials.paint(PALETTE.sage)],
    [rbox(0.02, 0.12, 0.12, 0.01, { x: 0.315, y: 0.3 }), materials.paint(PALETTE.sage)],
  ]
}

function pineTree(): Spec {
  const tier = (r: number, h: number, y: number) =>
    lathe(
      [
        [0.001, 0],
        [r * 0.95, 0],
        [r, 0.025],
        [r * 0.9, 0.06],
        [0.035, h - 0.02],
        [0.001, h],
      ],
      24,
      { y },
    )
  return [
    [cyl(0.055, 0.065, 0.3, { y: 0.15 }), materials.walnut()],
    [tier(0.36, 0.48, 0.22), materials.paint(PALETTE.sageDeep)],
    [tier(0.29, 0.42, 0.48), materials.paint(PALETTE.sageDeep)],
    [tier(0.21, 0.36, 0.78), materials.paint(PALETTE.sageDeep)],
  ]
}

function roundTree(): Spec {
  return [
    [cyl(0.04, 0.05, 0.5, { y: 0.25 }), materials.walnut()],
    [rbox(0.2, 0.04, 0.2, 0.015, { y: 0.02 }), materials.honey()],
    [place(new THREE.SphereGeometry(0.29, 28, 20), { y: 0.7 }), materials.paint(PALETTE.sage)],
  ]
}

function hill(): Spec {
  // Low felt mound filling the 2×2 footprint, about 0.6 tiles high.
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const r = 0.94 * Math.cos((t * Math.PI) / 2)
    const y = 0.6 * Math.pow(Math.sin((t * Math.PI) / 2), 1.4)
    pts.push([Math.max(r, 0.001), y])
  }
  const mound = lathe(pts, 40)
  mound.scale(1, 1, 0.92)
  return [
    [mound, materials.felt(PALETTE.sage)],
    [place(new THREE.SphereGeometry(0.07, 14, 10), { x: 0.55, y: 0.06, z: 0.55 }), materials.paint(PALETTE.mustard)],
    [place(new THREE.SphereGeometry(0.05, 14, 10), { x: -0.62, y: 0.04, z: 0.38 }), materials.paint(PALETTE.terracotta)],
  ]
}

function car(): Spec {
  const wheel = (x: number, z: number) => cyl(0.065, 0.065, 0.04, { x, y: 0.065, z, rz: Math.PI / 2 }, 18)
  return [
    [rbox(0.28, 0.11, 0.5, 0.04, { y: 0.115 }), materials.paint(PALETTE.dusty)],
    [rbox(0.24, 0.1, 0.24, 0.035, { y: 0.215, z: -0.03 }), materials.paint(PALETTE.creamLight)],
    [wheel(-0.145, 0.16), materials.plastic(PALETTE.charcoal)],
    [wheel(0.145, 0.16), materials.plastic(PALETTE.charcoal)],
    [wheel(-0.145, -0.16), materials.plastic(PALETTE.charcoal)],
    [wheel(0.145, -0.16), materials.plastic(PALETTE.charcoal)],
  ]
}

function cassette(): Spec {
  // True scale: 0.68 × 0.43 × 0.08 tiles (10.2 × 6.4 cm).
  const hub = (x: number) => cyl(0.055, 0.055, 0.006, { x, y: 0.082, z: 0.02 }, 18)
  return [
    [rbox(0.68, 0.08, 0.43, 0.012, { y: 0.04 }), materials.plastic(PALETTE.slate)],
    [rbox(0.56, 0.004, 0.2, 0.002, { y: 0.081, z: -0.07 }), materials.paint(PALETTE.creamLight)],
    [rbox(0.56, 0.004, 0.03, 0.002, { y: 0.0815, z: -0.12 }), materials.paint(PALETTE.terracotta)],
    [rbox(0.3, 0.004, 0.1, 0.002, { y: 0.0812, z: 0.03 }), materials.plastic('#3f4750')],
    [hub(-0.13), materials.plastic('#e8e0d0')],
    [hub(0.13), materials.plastic('#e8e0d0')],
  ]
}

function blocks(): Spec {
  const size = 0.26
  return [
    [rbox(size, size, size, 0.025, { x: -0.14, y: size / 2, z: 0.02 }), materials.letterBlock('A', PALETTE.terracotta)],
    [rbox(size, size, size, 0.025, { x: 0.14, y: size / 2, z: -0.02, ry: 0.12 }), materials.letterBlock('B', PALETTE.dustyDeep)],
    [rbox(size, size, size, 0.025, { x: 0, y: size * 1.5 + 0.002, ry: 0.35 }), materials.letterBlock('C', PALETTE.sageDeep)],
  ]
}

export function decorationParts(type: DecorationType): Part[] {
  const specs: Record<DecorationType, () => Spec> = { house, pineTree, roundTree, hill, car, cassette, blocks }
  return mergeParts(specs[type]())
}
