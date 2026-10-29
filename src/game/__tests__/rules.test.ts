import { describe, expect, it } from 'vitest'
import { autoAdjustRotation, validatePlacement } from '../rules'
import { countConnections } from '../connections'
import type { Piece, PieceType, Rotation } from '../types'

let n = 0
const p = (type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id: `p${++n}`,
  type,
  gridX,
  gridZ,
  rotation,
})

describe('validatePlacement', () => {
  it('accepts a track on an empty in-bounds tile', () => {
    expect(validatePlacement([], { type: 'straight', gx: 0, gz: 0 })).toBeNull()
  })

  it('rejects tiles beyond the grid', () => {
    expect(validatePlacement([], { type: 'straight', gx: 16, gz: 0 })).toBe('out_of_bounds')
    expect(validatePlacement([], { type: 'straight', gx: -1, gz: 3 })).toBe('out_of_bounds')
  })

  it('rejects a hill whose 2x2 footprint extends beyond the grid', () => {
    expect(validatePlacement([], { type: 'hill', gx: 15, gz: 15 })).toBe('out_of_bounds')
    expect(validatePlacement([], { type: 'hill', gx: 14, gz: 15 })).toBe('out_of_bounds')
    expect(validatePlacement([], { type: 'hill', gx: 14, gz: 14 })).toBeNull()
  })

  it('allows only one station', () => {
    expect(validatePlacement([p('station', 3, 3)], { type: 'station', gx: 8, gz: 8 })).toBe(
      'station_limit',
    )
  })

  it('rejects decorations on track tiles with on_track', () => {
    const pieces = [p('straight', 5, 5)]
    expect(validatePlacement(pieces, { type: 'house', gx: 5, gz: 5 })).toBe('on_track')
    expect(validatePlacement(pieces, { type: 'hill', gx: 4, gz: 4 })).toBe('on_track')
  })

  it('rejects any other overlap with occupied', () => {
    const pieces = [p('house', 5, 5), p('hill', 8, 8)]
    expect(validatePlacement(pieces, { type: 'straight', gx: 5, gz: 5 })).toBe('occupied')
    expect(validatePlacement(pieces, { type: 'house', gx: 5, gz: 5 })).toBe('occupied')
    expect(validatePlacement(pieces, { type: 'curve', gx: 9, gz: 9 })).toBe('occupied')
  })

  it('ignores the moving piece itself, even when the new footprint overlaps the old one', () => {
    const hill = p('hill', 2, 2)
    expect(validatePlacement([hill], { type: 'hill', gx: 3, gz: 2 }, hill.id)).toBeNull()
    const straight = p('straight', 6, 6)
    expect(validatePlacement([straight], { type: 'straight', gx: 6, gz: 6 }, straight.id)).toBeNull()
  })
})

describe('autoAdjustRotation', () => {
  it('rotates a dropped track clockwise to the first rotation that connects', () => {
    const pieces = [p('straight', 5, 5, 0)]
    expect(autoAdjustRotation(pieces, { type: 'curve', gx: 5, gz: 6, rotation: 0 })).toBe(180)
  })

  it('keeps the rotation when it already connects', () => {
    const pieces = [p('straight', 5, 5, 0)]
    expect(autoAdjustRotation(pieces, { type: 'straight', gx: 5, gz: 6, rotation: 0 })).toBe(0)
  })

  it('keeps the rotation when no neighbour has an open end facing the tile', () => {
    const pieces = [p('straight', 5, 5, 90)]
    expect(autoAdjustRotation(pieces, { type: 'straight', gx: 5, gz: 6, rotation: 90 })).toBe(90)
  })

  it('does not rotate decorations', () => {
    const pieces = [p('straight', 5, 5, 0)]
    expect(autoAdjustRotation(pieces, { type: 'house', gx: 5, gz: 6, rotation: 90 })).toBe(90)
  })

  it('produces a rotation that really connects', () => {
    const pieces = [p('straight', 5, 5, 90)]
    const rotation = autoAdjustRotation(pieces, { type: 'buffer', gx: 6, gz: 5, rotation: 0 })
    const placed = p('buffer', 6, 5, rotation)
    expect(countConnections([...pieces, placed], placed)).toBe(1)
    expect(rotation).toBe(90)
  })
})
