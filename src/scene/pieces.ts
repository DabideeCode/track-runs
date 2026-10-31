import * as THREE from 'three'
import type { PieceType } from '@/game/types'
import {
  addRail,
  Builder,
  colors,
  compose,
  curvedRail,
  RAIL_TOP,
  straightRail,
  type Merged,
} from './builder'

/** Extrudes a shape drawn in the XY plane along Z, centred on z = 0. */
const extrude = (shape: THREE.Shape, depth: number, bevel = 0.012, curveSegments = 10) => {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  })
  geometry.translate(0, 0, -(depth - bevel * 2) / 2)
  return geometry
}

const straight = () => {
  const builder = new Builder()
  addRail(builder, straightRail(), colors.honey)
  return builder.build()
}

const curve = () => {
  const builder = new Builder()
  addRail(builder, curvedRail(), colors.honey)
  return builder.build()
}

const tunnel = () => {
  const builder = new Builder()
  addRail(builder, straightRail(), colors.honey)

  const outerW = 0.43
  const outerH = 0.76
  const innerW = 0.27
  const innerH = 0.56
  const shape = new THREE.Shape()
  shape.moveTo(-outerW, 0)
  shape.lineTo(-outerW, outerH - outerW)
  shape.absarc(0, outerH - outerW, outerW, Math.PI, 0, true)
  shape.lineTo(outerW, 0)
  shape.lineTo(innerW, 0)
  shape.lineTo(innerW, innerH - innerW)
  shape.absarc(0, innerH - innerW, innerW, 0, Math.PI, false)
  shape.lineTo(-innerW, 0)
  shape.closePath()
  const shell = extrude(shape, 0.98, 0.012, 14)
  builder.add(shell, 'paint', colors.dusty)
  shell.dispose()

  // Keystone trim at each opening.
  for (const z of [-0.47, 0.47]) {
    builder.box([0.13, 0.11, 0.05], [0, outerH - 0.1, z], 'wood', colors.maple, 0.015)
  }
  return builder.build()
}

const station = () => {
  const builder = new Builder()
  addRail(builder, straightRail(), colors.honey)

  // Platform on the east side, clear of the train.
  builder.box([0.27, 0.13, 0.94], [0.355, 0.065, 0], 'wood', colors.maple, 0.02)
  builder.box([0.015, 0.012, 0.92], [0.235, 0.134, 0], 'paint', colors.mustard, 0.004)

  // Roof on two posts.
  for (const z of [-0.33, 0.33]) {
    builder.peg(0.02, 0.45, [0.4, 0.13, z], 'wood', colors.walnut)
  }
  const roof = new THREE.Shape()
  roof.moveTo(-0.15, 0)
  roof.lineTo(0.15, 0)
  roof.lineTo(0.15, 0.03)
  roof.lineTo(0, 0.11)
  roof.lineTo(-0.15, 0.03)
  roof.closePath()
  const roofGeometry = extrude(roof, 0.86, 0.01, 1)
  roofGeometry.applyMatrix4(compose([0.35, 0.58, 0]))
  builder.add(roofGeometry, 'paint', colors.terracotta)
  roofGeometry.dispose()

  // Bench and sign.
  builder.box([0.07, 0.03, 0.26], [0.42, 0.195, 0], 'paint', colors.deepBlue, 0.008)
  for (const z of [-0.1, 0.1]) builder.box([0.05, 0.05, 0.02], [0.42, 0.155, z], 'wood', colors.walnut, 0.006)
  return builder.build()
}

const buffer = () => {
  const builder = new Builder()
  addRail(builder, straightRail(0.5, -0.42), colors.honey)
  // Stop block on the north side; its south face is where the track ends for the train.
  builder.box([0.46, 0.24, 0.14], [0, 0.17, -0.37], 'paint', colors.terracotta, 0.03)
  builder.box([0.46, 0.05, 0.1], [0, 0.315, -0.39], 'wood', colors.walnut, 0.02)
  for (const x of [-0.13, 0.13]) {
    builder.peg(0.04, 0.04, [x, 0.2, -0.3], 'plastic', colors.mustard, [Math.PI / 2, 0, 0])
  }
  return builder.build()
}

const house = () => {
  const builder = new Builder()
  builder.box([0.66, 0.56, 0.6], [0, 0.28, 0], 'paint', colors.cream, 0.03)
  const gable = new THREE.Shape()
  gable.moveTo(-0.4, 0)
  gable.lineTo(0.4, 0)
  gable.lineTo(0, 0.44)
  gable.closePath()
  const roof = extrude(gable, 0.74, 0.016, 1)
  roof.applyMatrix4(compose([0, 0.56, 0]))
  builder.add(roof, 'paint', colors.terracotta)
  roof.dispose()
  builder.box([0.17, 0.3, 0.02], [0, 0.15, 0.302], 'paint', colors.deepBlue, 0.008)
  builder.sphere(0.012, [0.05, 0.14, 0.316], 'plastic', colors.mustard)
  for (const x of [-0.21, 0.21]) {
    builder.box([0.12, 0.13, 0.016], [x, 0.36, 0.302], 'paint', colors.dusty, 0.006)
  }
  for (const z of [-0.14, 0.14]) {
    builder.box([0.016, 0.13, 0.13], [0.332, 0.36, z], 'paint', colors.dusty, 0.006)
    builder.box([0.016, 0.13, 0.13], [-0.332, 0.36, z], 'paint', colors.dusty, 0.006)
  }
  builder.box([0.1, 0.2, 0.1], [0.2, 0.86, -0.08], 'wood', colors.walnut, 0.015)
  return builder.build()
}

const pineTree = () => {
  const builder = new Builder()
  builder.peg(0.075, 0.3, [0, 0, 0], 'wood', colors.walnut)
  builder.lathe(
    [
      [0, 0.22],
      [0.3, 0.22],
      [0.345, 0.25],
      [0.33, 0.29],
      [0.05, 1.16],
      [0.02, 1.195],
      [0, 1.2],
    ],
    [0, 0, 0],
    'paint',
    colors.moss,
    16,
  )
  return builder.build()
}

const roundTree = () => {
  const builder = new Builder()
  builder.peg(0.05, 0.5, [0, 0, 0], 'wood', colors.maple)
  builder.sphere(0.3, [0, 0.7, 0], 'paint', colors.sage)
  return builder.build()
}

const hill = () => {
  const builder = new Builder()
  const dome: [number, number][] = []
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    dome.push([0.97 * Math.cos((t * Math.PI) / 2) ** 0.85, 0.6 * Math.sin((t * Math.PI) / 2) ** 1.3])
  }
  builder.lathe(dome, [0, 0, 0], 'paint', colors.sage, 28)
  // A smaller shoulder, a stone and a sapling, so rotating the hill visibly turns it.
  builder.lathe(
    dome.map(([r, y]) => [r * 0.42, y * 0.55]),
    [0.42, 0.14, 0.34],
    'paint',
    colors.moss,
    20,
  )
  builder.sphere(0.075, [-0.42, 0.26, 0.46], 'paint', colors.ash, [1, 0.7, 0.85])
  builder.peg(0.018, 0.16, [-0.2, 0.47, -0.3], 'wood', colors.walnut)
  builder.sphere(0.07, [-0.2, 0.66, -0.3], 'paint', colors.moss)
  return builder.build()
}

const car = () => {
  const builder = new Builder()
  builder.box([0.3, 0.09, 0.5], [0, 0.1, 0], 'paint', colors.terracotta, 0.035)
  builder.box([0.24, 0.085, 0.24], [0, 0.18, 0.03], 'wood', colors.maple, 0.03)
  builder.box([0.245, 0.05, 0.015], [0, 0.185, -0.092], 'plastic', colors.deepBlue, 0.005)
  for (const x of [-0.15, 0.15]) {
    for (const z of [-0.15, 0.15]) builder.wheel(0.055, 0.05, x, 0.055, z, colors.charcoal)
  }
  return builder.build()
}

const cassette = () => {
  const builder = new Builder()
  // 0.68 x 0.43 x 0.08 tiles.
  builder.box([0.68, 0.08, 0.43], [0, 0.04, 0], 'plastic', colors.charcoal, 0.012)
  builder.box([0.6, 0.006, 0.27], [0, 0.082, -0.04], 'paint', colors.cream, 0.002)
  builder.box([0.6, 0.007, 0.05], [0, 0.083, -0.135], 'paint', colors.terracotta, 0.002)
  builder.box([0.36, 0.008, 0.095], [0, 0.084, -0.02], 'plastic', colors.ash, 0.003)
  for (const x of [-0.105, 0.105]) {
    builder.peg(0.03, 0.01, [x, 0.081, -0.02], 'plastic', colors.cream)
  }
  builder.box([0.44, 0.012, 0.075], [0, 0.082, 0.165], 'plastic', colors.ash, 0.004)
  return builder.build()
}

/** Raised painted strokes spelling T, O and Y on block faces. */
const blocks = () => {
  const builder = new Builder()
  const size = 0.29
  const half = size / 2
  const stroke = 0.045
  const depth = 0.008
  const face = size / 2 + depth / 2 - 0.001

  const letterT = (x: number, y: number, z: number, color: string) => {
    builder.box([0.17, stroke, depth], [x, y + 0.065, z + face], 'paint', color, 0.003)
    builder.box([stroke, 0.17, depth], [x, y, z + face], 'paint', color, 0.003)
  }
  const letterO = (x: number, y: number, z: number, color: string) => {
    builder.box([0.17, stroke, depth], [x, y + 0.065, z + face], 'paint', color, 0.003)
    builder.box([0.17, stroke, depth], [x, y - 0.065, z + face], 'paint', color, 0.003)
    for (const dx of [-0.0625, 0.0625]) {
      builder.box([stroke, 0.17, depth], [x + dx, y, z + face], 'paint', color, 0.003)
    }
  }
  const letterY = (x: number, y: number, z: number, color: string) => {
    builder.box([stroke, 0.1, depth], [x, y - 0.04, z + face], 'paint', color, 0.003)
    for (const dir of [-1, 1]) {
      builder.box(
        [stroke, 0.11, depth],
        [x + dir * 0.038, y + 0.045, z + face],
        'paint',
        color,
        0.003,
        [0, 0, -dir * 0.62],
      )
    }
  }

  builder.box([size, size, size], [-0.15, half, 0.03], 'wood', colors.maple, 0.022)
  letterT(-0.15, half, 0.03, colors.rust)
  builder.box([size, size, size], [0.16, half, -0.02], 'wood', colors.honey, 0.022)
  letterO(0.16, half, -0.02, colors.deepBlue)
  builder.box([size, size, size], [0.01, size + half, 0], 'wood', colors.maple, 0.022, [0, 0.0, 0])
  letterY(0.01, size + half, 0, colors.moss)
  return builder.build()
}

const BUILDERS: Record<PieceType, () => Merged> = {
  straight,
  curve,
  tunnel,
  station,
  buffer,
  house,
  pineTree,
  roundTree,
  hill,
  car,
  cassette,
  blocks,
}

const cache = new Map<PieceType, Merged>()

/** One merged geometry per material, shared by every instance of a type. */
export const pieceGeometry = (type: PieceType): Merged => {
  let merged = cache.get(type)
  if (!merged) {
    merged = BUILDERS[type]()
    cache.set(type, merged)
  }
  return merged
}

const WHEEL_X = 0.095

const trainChassis = (builder: Builder, length: number, axles: number[], color: string) => {
  const floor = RAIL_TOP + 0.05
  builder.box([0.28, 0.05, length], [0, floor, 0], 'wood', color, 0.018)
  for (const z of axles) {
    for (const x of [-WHEEL_X, WHEEL_X]) builder.wheel(0.052, 0.03, x, 0.1, z, colors.charcoal)
  }
  return floor + 0.025
}

/** Locomotive 0.9 long, facing -Z, under the 0.56 tunnel arch. */
export const locomotiveGeometry = (): Merged => {
  const builder = new Builder()
  const deck = trainChassis(builder, 0.86, [-0.28, 0, 0.28], colors.walnut)
  // Boiler
  builder.peg(0.105, 0.48, [0, deck + 0.105, -0.42], 'paint', colors.terracotta, [Math.PI / 2, 0, 0])
  builder.peg(0.112, 0.03, [0, deck + 0.105, -0.26], 'paint', colors.mustard, [Math.PI / 2, 0, 0])
  builder.peg(0.112, 0.03, [0, deck + 0.105, -0.08], 'paint', colors.mustard, [Math.PI / 2, 0, 0])
  builder.peg(0.07, 0.02, [0, deck + 0.105, -0.44], 'paint', colors.cream, [Math.PI / 2, 0, 0])
  // Chimney and dome
  builder.lathe(
    [
      [0, 0],
      [0.035, 0],
      [0.04, 0.09],
      [0.058, 0.13],
      [0.055, 0.15],
      [0, 0.15],
    ],
    [0, deck + 0.19, -0.3],
    'wood',
    colors.walnut,
    12,
  )
  builder.sphere(0.042, [0, deck + 0.215, -0.1], 'paint', colors.mustard)
  // Cab
  builder.box([0.27, 0.24, 0.27], [0, deck + 0.12, 0.27], 'wood', colors.maple, 0.02)
  builder.box([0.31, 0.03, 0.33], [0, deck + 0.255, 0.27], 'paint', colors.deepBlue, 0.012)
  for (const x of [-0.137, 0.137]) {
    builder.box([0.012, 0.09, 0.12], [x, deck + 0.14, 0.27], 'paint', colors.deepBlue, 0.004)
  }
  return builder.build()
}

/** Carriage 0.8 long. */
export const carriageGeometry = (body: string, roof: string): Merged => {
  const builder = new Builder()
  const deck = trainChassis(builder, 0.78, [-0.24, 0.24], colors.walnut)
  builder.box([0.27, 0.19, 0.72], [0, deck + 0.095, 0], 'paint', body, 0.022)
  builder.box([0.31, 0.03, 0.78], [0, deck + 0.205, 0], 'paint', roof, 0.012)
  for (const z of [-0.22, 0, 0.22]) {
    for (const x of [-0.137, 0.137]) {
      builder.box([0.012, 0.085, 0.13], [x, deck + 0.115, z], 'paint', colors.cream, 0.004)
    }
  }
  return builder.build()
}
