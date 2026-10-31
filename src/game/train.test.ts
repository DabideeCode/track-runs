import { describe, expect, it } from 'vitest'
import { buildChain, piecePath, samplePath, type Chain } from './trackPath'
import {
  createTrain,
  CRUISE_SPEED,
  MANUAL_TOP_SPEED,
  stepTrain,
  trainPoses,
  trainReport,
  type DriveInput,
  type TrainState,
} from './train'
import type { Piece, PieceType, Rotation, StartFacing } from './types'

let n = 0
const p = (type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id: `t${++n}`,
  type,
  gridX,
  gridZ,
  rotation,
})

const auto: DriveInput = { driveMode: 'auto', forward: false, reverse: false }
const manual = (forward: boolean, reverse: boolean): DriveInput => ({
  driveMode: 'manual',
  forward,
  reverse,
})

const run = (train: TrainState, seconds: number, input: DriveInput, dt = 1 / 60) => {
  const events: string[] = []
  for (let t = 0; t < seconds; t += dt) events.push(...stepTrain(train, dt, input))
  return events
}

/** North-south line at x = 5, station `stationZ`, from z = top to z = bottom. */
const line = (top: number, bottom: number, stationZ: number) => {
  const pieces: Piece[] = []
  for (let z = top; z <= bottom; z++) pieces.push(p(z === stationZ ? 'station' : 'straight', 5, z))
  return pieces
}

const loop = () => {
  // A 3 by 2 rectangle: corners are curves, station on the west side.
  const pieces = [
    p('curve', 2, 2, 0), // S, E
    p('straight', 3, 2, 90),
    p('curve', 4, 2, 90), // S, W
    p('straight', 4, 3),
    p('curve', 4, 4, 180), // N, W
    p('straight', 3, 4, 90),
    p('curve', 2, 4, 270), // N, E
    p('station', 2, 3),
  ]
  return pieces
}

const chainOf = (pieces: Piece[], facing: StartFacing = 0): Chain => {
  const station = pieces.find((piece) => piece.type === 'station')!
  return buildChain(pieces, station.id, facing)!
}

describe('piecePath', () => {
  it('follows a quarter circle of radius 0.5 centred on the south-east corner', () => {
    const seg = piecePath(p('curve', 8, 8), 'S')
    expect(seg.length).toBeCloseTo(Math.PI / 4)
    const center = { x: 1, z: 1 } // tile (8,8) centre is (0.5, 0.5); corner is one half further
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const point = seg.at(t)
      expect(Math.hypot(point.x - center.x, point.z - center.z)).toBeCloseTo(0.5)
    }
    expect(seg.at(0)).toMatchObject({ x: 0.5, z: 1 })
    const end = seg.at(1)
    expect(end.x).toBeCloseTo(1)
    expect(end.z).toBeCloseTo(0.5)
  })
  it('rotates the curve clockwise with the piece', () => {
    const seg = piecePath(p('curve', 8, 8, 90), 'S')
    const center = { x: 0, z: 1 } // south-west corner
    expect(Math.hypot(seg.at(0.5).x - center.x, seg.at(0.5).z - center.z)).toBeCloseTo(0.5)
  })
  it('stops a buffer track before the block on its north side', () => {
    const seg = piecePath(p('buffer', 8, 8), 'S')
    expect(seg.length).toBeLessThan(1)
    expect(seg.at(0).z).toBeCloseTo(1)
    expect(seg.at(1).z).toBeGreaterThan(0)
  })
})

describe('buildChain', () => {
  it('walks a closed loop', () => {
    const chain = chainOf(loop())
    expect(chain.closed).toBe(true)
    expect(chain.segments).toHaveLength(8)
    expect(chain.length).toBeCloseTo(4 * (Math.PI / 4) + 4)
  })
  it('walks an open line in both directions from the station', () => {
    const chain = chainOf(line(2, 8, 5))
    expect(chain.closed).toBe(false)
    expect(chain.segments).toHaveLength(7)
    expect(chain.length).toBeCloseTo(7)
    expect(chain.stationS).toBeCloseTo(3.5)
  })
  it('orients +s toward the facing connector', () => {
    const pieces = line(2, 8, 5)
    const north = chainOf(pieces, 0)
    const south = chainOf(pieces, 180)
    expect(samplePath(north, north.stationS + 1).z).toBeLessThan(samplePath(north, north.stationS).z)
    expect(samplePath(south, south.stationS + 1).z).toBeGreaterThan(
      samplePath(south, south.stationS).z,
    )
  })
  it('honours the station rotation for facing', () => {
    const station = p('station', 5, 5, 90)
    const east = p('straight', 6, 5, 90)
    const chain = chainOf([station, east], 0)
    expect(samplePath(chain, chain.stationS + 1).x).toBeGreaterThan(
      samplePath(chain, chain.stationS).x,
    )
  })
  it('ignores tracks that are not connected', () => {
    const pieces = [...line(2, 4, 3), p('straight', 5, 6), p('straight', 9, 9)]
    expect(chainOf(pieces).segments).toHaveLength(3)
  })
  it('wraps coordinates on a loop', () => {
    const chain = chainOf(loop())
    const a = samplePath(chain, 1)
    const b = samplePath(chain, 1 + chain.length)
    expect(b.x).toBeCloseTo(a.x)
    expect(b.z).toBeCloseTo(a.z)
  })
})

describe('spawn', () => {
  it('parks the locomotive on the station at its centre', () => {
    const pieces = line(2, 8, 5)
    const report = trainReport(createTrain(chainOf(pieces)))
    expect(report.pieceId).toBe(pieces.find((piece) => piece.type === 'station')!.id)
    expect(report.progress).toBeCloseTo(0.5)
    expect(report.moving).toBe(false)
    expect(report.direction).toBe('forward')
  })
})

describe('auto driving', () => {
  it('cruises at 1.5 tiles per second', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 2, auto)
    expect(trainReport(train).speed).toBeCloseTo(CRUISE_SPEED)
    expect(CRUISE_SPEED).toBe(1.5)
    const before = train.s
    run(train, 1, auto)
    expect(train.s - before).toBeCloseTo(1.5, 1)
  })
  it('runs a closed loop indefinitely', () => {
    const train = createTrain(chainOf(loop()))
    const events = run(train, 120, auto, 1 / 30)
    expect(events).not.toContain('bump')
    expect(trainReport(train).moving).toBe(true)
    expect(trainReport(train).direction).toBe('forward')
  })
  it('stops at an open end, pauses 1 second, then runs in reverse', () => {
    const pieces = line(0, 9, 8)
    const train = createTrain(chainOf(pieces))
    // Nose reaches the north end after about 8 tiles.
    let t = 0
    while (train.speed > 0 || t < 0.5) {
      stepTrain(train, 1 / 60, auto)
      t += 1 / 60
      if (t > 20) throw new Error('never stopped')
    }
    expect(trainReport(train).pieceId).toBe(pieces[0].id)
    expect(train.s).toBeCloseTo(chainOf(pieces).length - 0.45)
    run(train, 0.9, auto)
    expect(trainReport(train).moving).toBe(false)
    run(train, 0.25, auto)
    expect(trainReport(train).moving).toBe(true)
    expect(trainReport(train).direction).toBe('reverse')
  })
  it('eases down rather than stopping dead', () => {
    const train = createTrain(chainOf(line(0, 9, 8)))
    const speeds: number[] = []
    for (let i = 0; i < 1000 && (i < 30 || train.speed > 0); i++) {
      stepTrain(train, 1 / 60, auto)
      speeds.push(train.speed)
    }
    const drops = speeds.slice(1).map((v, i) => speeds[i] - v)
    expect(Math.max(...drops)).toBeLessThan(0.15)
  })
  it('stops at a buffer with a bump', () => {
    const pieces = [p('buffer', 5, 0), ...line(1, 6, 4)]
    const train = createTrain(chainOf(pieces))
    const events = run(train, 6, auto)
    expect(events).toContain('bump')
    expect(events.filter((e) => e === 'bump')).toHaveLength(1)
  })
  it('stops reversing with the tail at the far end', () => {
    const pieces = line(0, 12, 6)
    const chain = chainOf(pieces)
    const train = createTrain(chain)
    run(train, 40, auto)
    expect(train.s).toBeGreaterThanOrEqual(2.25 - 1e-6)
    expect(train.s).toBeLessThanOrEqual(chain.length - 0.45 + 1e-6)
  })
})

describe('manual driving', () => {
  it('reaches top speed within 1 second and holds it', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 1, manual(true, false))
    expect(trainReport(train).speed).toBeCloseTo(MANUAL_TOP_SPEED)
    expect(MANUAL_TOP_SPEED).toBe(2)
    expect(trainReport(train).direction).toBe('forward')
  })
  it('stops within 0.5 seconds of release', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 1.5, manual(true, false))
    run(train, 0.5, manual(false, false))
    expect(trainReport(train).speed).toBe(0)
    expect(trainReport(train).moving).toBe(false)
  })
  it('reverses with S and carriages lead', () => {
    const train = createTrain(chainOf(loop()))
    const before = train.s
    run(train, 1, manual(false, true))
    expect(train.s).toBeLessThan(before)
    expect(trainReport(train).direction).toBe('reverse')
  })
  it('brakes before changing direction', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 1, manual(true, false))
    run(train, 0.1, manual(false, true))
    expect(train.s).toBeGreaterThan(0)
    expect(trainReport(train).direction).toBe('forward')
    run(train, 1, manual(false, true))
    expect(trainReport(train).direction).toBe('reverse')
  })
  it('treats both keys together as neither', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 1, manual(true, true))
    expect(trainReport(train).speed).toBe(0)
  })
  it('stops at an open end and refuses to go further', () => {
    const pieces = line(0, 9, 3)
    const chain = chainOf(pieces)
    const train = createTrain(chain)
    const events = run(train, 6, manual(true, false))
    expect(train.s).toBeCloseTo(chain.length - 0.45)
    expect(trainReport(train).moving).toBe(false)
    expect(events.filter((e) => e === 'bump')).toHaveLength(1)
    run(train, 2, manual(true, false))
    expect(train.s).toBeCloseTo(chain.length - 0.45)
  })
  it('can back away from the end again', () => {
    const train = createTrain(chainOf(line(0, 9, 3)))
    run(train, 6, manual(true, false))
    const end = train.s
    run(train, 1, manual(false, true))
    expect(train.s).toBeLessThan(end)
  })
})

describe('switching drive mode', () => {
  it('brakes to a stop when switched to manual with no keys', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 2, auto)
    run(train, 0.5, manual(false, false))
    expect(trainReport(train).speed).toBe(0)
  })
  it('sets off again when switched back to auto', () => {
    const train = createTrain(chainOf(loop()))
    run(train, 1, manual(false, false))
    run(train, 1, auto)
    expect(trainReport(train).moving).toBe(true)
  })
  it('recovers when auto is resumed against a dead end', () => {
    const train = createTrain(chainOf(line(0, 9, 3)))
    run(train, 6, manual(true, false))
    run(train, 1.5, auto)
    expect(trainReport(train).direction).toBe('reverse')
    expect(trainReport(train).moving).toBe(true)
  })
})

describe('short track', () => {
  it('keeps a lone station train finite and on the station', () => {
    const station = p('station', 5, 5)
    const train = createTrain(chainOf([station]))
    run(train, 10, auto)
    run(train, 2, manual(true, false))
    run(train, 2, manual(false, true))
    const report = trainReport(train)
    expect(report.pieceId).toBe(station.id)
    expect(Number.isFinite(report.progress)).toBe(true)
    for (const pose of trainPoses(train)) {
      expect(Number.isFinite(pose.x)).toBe(true)
      expect(Number.isFinite(pose.z)).toBe(true)
    }
  })
  it('can always return to the station when the track behind is short', () => {
    const pieces = line(0, 6, 5)
    const train = createTrain(chainOf(pieces))
    const start = train.s
    run(train, 30, auto)
    expect(train.s).toBeGreaterThanOrEqual(start - 1e-6)
  })
})

describe('carriages', () => {
  it('trail the locomotive at a fixed spacing along the line', () => {
    const train = createTrain(chainOf(line(0, 12, 6)))
    run(train, 1, auto)
    const [loco, first, second] = trainPoses(train)
    expect(Math.abs(first.z - loco.z)).toBeCloseTo(0.95)
    expect(Math.abs(second.z - first.z)).toBeCloseTo(0.9)
    expect(first.z).toBeGreaterThan(loco.z)
  })
  it('stay on the centreline through curves', () => {
    const chain = chainOf(loop())
    const train = createTrain(chain)
    for (let i = 0; i < 400; i++) {
      stepTrain(train, 1 / 60, auto)
      for (const pose of trainPoses(train)) {
        const inside = pose.x > -6.01 && pose.x < -3.49 && pose.z > -6.01 && pose.z < -3.49
        expect(inside).toBe(true)
      }
    }
  })
})
