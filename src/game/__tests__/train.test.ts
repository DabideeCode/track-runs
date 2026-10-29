import { describe, expect, it } from 'vitest'
import { NOSE, createTrain, distanceToEnd, stepTrain, trainInfo, trainPoses, type TrainInput } from '../train'
import type { Piece, PieceType, Rotation } from '../types'

const p = (id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id,
  type,
  gridX,
  gridZ,
  rotation,
})

const AUTO: TrainInput = { drive: 'auto', fwd: false, rev: false }

function run(sim: ReturnType<typeof createTrain>, pieces: Piece[], seconds: number, input = AUTO) {
  const events: string[] = []
  const steps = Math.round(seconds * 60)
  for (let i = 0; i < steps; i++) events.push(...stepTrain(sim!, pieces, 1 / 60, input))
  return events
}

const LOOP = [
  p('c1', 'curve', 5, 4, 0),
  p('c2', 'curve', 6, 4, 90),
  p('c3', 'curve', 6, 6, 180),
  p('c4', 'curve', 5, 6, 270),
  p('st', 'station', 5, 5, 0),
  p('s1', 'straight', 6, 5, 0),
]

// Station facing north into a straight then a buffer stop; long run of track to the south.
const DEAD_END = [
  p('bf', 'buffer', 5, 3, 0),
  p('s1', 'straight', 5, 4, 0),
  p('st', 'station', 5, 5, 0),
  p('s2', 'straight', 5, 6, 0),
  p('s3', 'straight', 5, 7, 0),
  p('s4', 'straight', 5, 8, 0),
]

const allFinite = (sim: ReturnType<typeof createTrain>, pieces: Piece[]) =>
  trainPoses(sim!, pieces).every((q) => [q.x, q.z, q.heading].every(Number.isFinite))

describe('train simulation', () => {
  it('has no train without a station', () => {
    expect(createTrain([p('a', 'straight', 1, 1)], 0)).toBeNull()
  })

  it('spawns the locomotive centred on the station, at rest, facing forward', () => {
    const sim = createTrain(DEAD_END, 0)
    expect(trainInfo(sim!, DEAD_END)).toEqual({
      pieceId: 'st',
      progress: 0.5,
      moving: false,
      direction: 'forward',
      speed: 0,
    })
  })

  it('departs towards the station north connector with facing 0, and south with 180', () => {
    const north = createTrain(DEAD_END, 0)
    run(north, DEAD_END, 1)
    expect(north!.cursor.pieceId).toBe('s1')
    const south = createTrain(DEAD_END, 180)
    run(south, DEAD_END, 1)
    expect(south!.cursor.pieceId).toBe('s2')
  })

  it('runs indefinitely at 1.5 tiles/s on a closed loop', () => {
    const sim = createTrain(LOOP, 0)
    const events = run(sim, LOOP, 20)
    expect(events.filter((e) => e === 'bump')).toHaveLength(0)
    expect(events.filter((e) => e === 'chug')).toHaveLength(1)
    expect(trainInfo(sim!, LOOP).speed).toBeCloseTo(1.5, 5)
    expect(trainInfo(sim!, LOOP).moving).toBe(true)
    expect(allFinite(sim, LOOP)).toBe(true)
  })

  it('eases to a stop at a buffer stop, pauses for 1 s, then runs in reverse', () => {
    const sim = createTrain(DEAD_END, 0)
    const first = run(sim, DEAD_END, 2.0)
    expect(first.filter((e) => e === 'bump')).toHaveLength(1)
    expect(trainInfo(sim!, DEAD_END).speed).toBe(0)
    expect(distanceToEnd(DEAD_END, sim!.cursor, sim!.facing)).toBeGreaterThanOrEqual(NOSE - 1e-6)
    run(sim, DEAD_END, 0.4)
    expect(trainInfo(sim!, DEAD_END).moving).toBe(false)
    const later = run(sim, DEAD_END, 1.6)
    expect(later.filter((e) => e === 'bump')).toHaveLength(0)
    expect(trainInfo(sim!, DEAD_END)).toMatchObject({ moving: true, direction: 'reverse' })
  })

  it('handles a lone station without leaving the track or bumping repeatedly', () => {
    const lone = [p('st', 'station', 8, 8, 90)]
    const sim = createTrain(lone, 0)
    const events = run(sim, lone, 6)
    expect(events.filter((e) => e === 'bump').length).toBeLessThanOrEqual(1)
    expect(allFinite(sim, lone)).toBe(true)
    expect(sim!.cursor.pieceId).toBe('st')
  })

  it('reaches 2 tiles/s within 1 s of holding W in manual, and stops within 0.5 s of release', () => {
    const sim = createTrain(LOOP, 0)
    run(sim, LOOP, 1, { drive: 'manual', fwd: true, rev: false })
    expect(trainInfo(sim!, LOOP).speed).toBeCloseTo(2, 5)
    expect(trainInfo(sim!, LOOP).direction).toBe('forward')
    run(sim, LOOP, 0.5, { drive: 'manual', fwd: false, rev: false })
    expect(trainInfo(sim!, LOOP).speed).toBe(0)
  })

  it('moves in reverse while S is held in manual', () => {
    const sim = createTrain(LOOP, 0)
    run(sim, LOOP, 0.5, { drive: 'manual', fwd: false, rev: true })
    expect(trainInfo(sim!, LOOP)).toMatchObject({ moving: true, direction: 'reverse' })
  })

  it('stops at a dead end in manual and will not move further that way', () => {
    const sim = createTrain(DEAD_END, 0)
    const events = run(sim, DEAD_END, 5, { drive: 'manual', fwd: true, rev: false })
    expect(events.filter((e) => e === 'bump')).toHaveLength(1)
    expect(trainInfo(sim!, DEAD_END).speed).toBe(0)
    expect(sim!.cursor.pieceId).toBe('bf')
    expect(distanceToEnd(DEAD_END, sim!.cursor, sim!.facing)).toBeGreaterThanOrEqual(NOSE - 1e-6)
  })

  it('places carriages behind the locomotive at fixed spacing on straight track', () => {
    const sim = createTrain(DEAD_END, 0)
    const [loco, c1, c2] = trainPoses(sim!, DEAD_END)
    expect(c1.z - loco.z).toBeCloseTo(0.95)
    expect(c2.z - loco.z).toBeCloseTo(1.85)
    expect(c1.x).toBeCloseTo(loco.x)
  })
})
