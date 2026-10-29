import { describe, expect, it } from 'vitest'
import { pathEnds, pathLength, samplePath } from '../trackPath'
import type { Piece, PieceType, Rotation } from '../types'

const p = (type: PieceType, rotation: Rotation = 0, gridX = 0, gridZ = 0): Piece => ({
  id: 'x',
  type,
  gridX,
  gridZ,
  rotation,
})

const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.z).toBeCloseTo(b.z, 6)
}

describe('trackPath', () => {
  it('has the documented path lengths', () => {
    expect(pathLength('straight')).toBe(1)
    expect(pathLength('station')).toBe(1)
    expect(pathLength('tunnel')).toBe(1)
    expect(pathLength('curve')).toBeCloseTo(Math.PI / 4)
    expect(pathLength('buffer')).toBe(0.75)
  })

  it('runs a straight at 0° from its north edge to its south edge', () => {
    close(samplePath(p('straight'), 0), { x: -7.5, z: -8 })
    close(samplePath(p('straight'), 1), { x: -7.5, z: -7 })
  })

  it('runs a curve at 0° from the south edge to the east edge along a radius-0.5 arc about the SE corner', () => {
    close(samplePath(p('curve'), 0), { x: -7.5, z: -7 })
    close(samplePath(p('curve'), Math.PI / 4), { x: -7, z: -7.5 })
    const mid = samplePath(p('curve'), Math.PI / 8)
    expect(Math.hypot(mid.x - -7, mid.z - -7)).toBeCloseTo(0.5, 6)
  })

  it('rotates paths clockwise: a straight at 90° runs from east to west', () => {
    close(samplePath(p('straight', 90), 0), { x: -7, z: -7.5 })
    close(samplePath(p('straight', 90), 1), { x: -8, z: -7.5 })
  })

  it('gives the +u heading as a yaw where 0 points to +Z (south)', () => {
    expect(samplePath(p('straight'), 0.5).heading).toBeCloseTo(0)
    expect(Math.abs(samplePath(p('buffer'), 0.2).heading)).toBeCloseTo(Math.PI)
  })

  it('reports the edges at each end of the path, with a dead end for the buffer', () => {
    expect(pathEnds(p('curve', 90))).toEqual({ startDir: 'W', endDir: 'S' })
    expect(pathEnds(p('buffer', 180))).toEqual({ startDir: 'N', endDir: null })
  })
})
