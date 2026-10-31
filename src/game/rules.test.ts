import { describe, expect, it } from 'vitest'
import { connectorsOf, footprint, sideDelta, tileCenter, worldToTile } from './grid'
import { autoRotate, findConnections, openEnds, validate } from './rules'
import type { Piece, PieceType, Rotation } from './types'

let n = 0
const p = (type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id: `p${++n}`,
  type,
  gridX,
  gridZ,
  rotation,
})

describe('grid', () => {
  it('maps tiles to the world as Section 4 states', () => {
    expect(tileCenter(0, 0)).toEqual({ x: -7.5, z: -7.5 })
    expect(tileCenter(15, 15)).toEqual({ x: 7.5, z: 7.5 })
  })
  it('maps world points to the tile containing them', () => {
    expect(worldToTile(-7.9, -7.9)).toEqual({ gridX: 0, gridZ: 0 })
    expect(worldToTile(0.1, -0.1)).toEqual({ gridX: 8, gridZ: 7 })
    expect(worldToTile(7.99, 7.99)).toEqual({ gridX: 15, gridZ: 15 })
    expect(worldToTile(8.01, 0)).toBeNull()
    expect(worldToTile(0, -8.01)).toBeNull()
  })
  it('rotates connectors clockwise: north moves to east', () => {
    expect(connectorsOf(p('straight', 0, 0, 90)).sort()).toEqual(['E', 'W'])
    expect(connectorsOf(p('buffer', 0, 0, 90))).toEqual(['W'])
    expect(connectorsOf(p('curve', 0, 0)).sort()).toEqual(['E', 'S'])
    expect(connectorsOf(p('curve', 0, 0, 90)).sort()).toEqual(['S', 'W'])
    expect(connectorsOf(p('curve', 0, 0, 180)).sort()).toEqual(['N', 'W'])
    expect(connectorsOf(p('curve', 0, 0, 270)).sort()).toEqual(['E', 'N'])
  })
  it('has side deltas matching north = -Z, east = +X', () => {
    expect(sideDelta.N).toEqual([0, -1])
    expect(sideDelta.E).toEqual([1, 0])
  })
  it('gives the hill the anchor plus east, south and south-east tiles', () => {
    expect(footprint('hill', 3, 4)).toEqual([
      [3, 4],
      [4, 4],
      [3, 5],
      [4, 5],
    ])
  })
})

describe('validate', () => {
  it('accepts a free tile', () => {
    expect(validate([], { type: 'straight', gridX: 0, gridZ: 0 })).toBeNull()
  })
  it('rejects off-grid and fractional positions', () => {
    expect(validate([], { type: 'straight', gridX: 16, gridZ: 0 })).toBe('out_of_bounds')
    expect(validate([], { type: 'straight', gridX: -1, gridZ: 0 })).toBe('out_of_bounds')
    expect(validate([], { type: 'straight', gridX: 1.5, gridZ: 0 })).toBe('out_of_bounds')
  })
  it('keeps the hill fully on the grid', () => {
    expect(validate([], { type: 'hill', gridX: 15, gridZ: 0 })).toBe('out_of_bounds')
    expect(validate([], { type: 'hill', gridX: 0, gridZ: 15 })).toBe('out_of_bounds')
    expect(validate([], { type: 'hill', gridX: 14, gridZ: 14 })).toBeNull()
  })
  it('allows one piece per tile', () => {
    expect(validate([p('house', 2, 2)], { type: 'car', gridX: 2, gridZ: 2 })).toBe('occupied')
    expect(validate([p('straight', 2, 2)], { type: 'curve', gridX: 2, gridZ: 2 })).toBe('occupied')
    expect(validate([p('house', 2, 2)], { type: 'straight', gridX: 2, gridZ: 2 })).toBe('occupied')
  })
  it('stops decorations sitting on tracks', () => {
    expect(validate([p('straight', 2, 2)], { type: 'house', gridX: 2, gridZ: 2 })).toBe('on_track')
  })
  it('checks every tile of a hill', () => {
    expect(validate([p('house', 4, 5)], { type: 'hill', gridX: 3, gridZ: 4 })).toBe('occupied')
    expect(validate([p('straight', 4, 5)], { type: 'hill', gridX: 3, gridZ: 4 })).toBe('on_track')
    expect(validate([p('hill', 3, 4)], { type: 'house', gridX: 4, gridZ: 5 })).toBe('occupied')
    expect(validate([p('hill', 3, 4)], { type: 'hill', gridX: 4, gridZ: 5 })).toBe('occupied')
  })
  it('limits stations to one', () => {
    expect(validate([p('station', 2, 2)], { type: 'station', gridX: 5, gridZ: 5 })).toBe(
      'station_limit',
    )
  })
  it('ignores the moving piece itself, so a station can move and a hill can shuffle one tile', () => {
    const st = p('station', 2, 2)
    expect(validate([st], { type: 'station', gridX: 3, gridZ: 2 }, st.id)).toBeNull()
    const h = p('hill', 3, 4)
    expect(validate([h], { type: 'hill', gridX: 4, gridZ: 4 }, h.id)).toBeNull()
  })
})

describe('connections', () => {
  it('connects adjacent tracks with connectors on the shared edge', () => {
    const a = p('straight', 5, 5)
    const b = p('straight', 5, 6)
    expect(findConnections([a, b])).toEqual([[a.id, b.id]])
  })
  it('needs a connector on both sides', () => {
    expect(findConnections([p('straight', 5, 5), p('straight', 5, 6, 90)])).toEqual([])
    expect(findConnections([p('straight', 5, 5), p('straight', 6, 5)])).toEqual([])
  })
  it('ignores decorations and the buffer block side', () => {
    expect(findConnections([p('straight', 5, 5), p('house', 5, 6)])).toEqual([])
    expect(findConnections([p('buffer', 5, 6), p('straight', 5, 5)])).toEqual([])
    const b = p('buffer', 5, 4)
    const s = p('straight', 5, 5)
    expect(findConnections([b, s])).toEqual([[b.id, s.id]])
  })
  it('joins a curve on its south and east edges', () => {
    const c = p('curve', 5, 5)
    const south = p('straight', 5, 6)
    const east = p('straight', 6, 5, 90)
    expect(findConnections([c, south, east])).toHaveLength(2)
  })
  it('lists open ends with the side they face', () => {
    const a = p('straight', 5, 5)
    const b = p('straight', 5, 6)
    expect(openEnds([a, b])).toEqual([
      { gridX: 5, gridZ: 5, side: 'N' },
      { gridX: 5, gridZ: 6, side: 'S' },
    ])
  })
  it('counts an edge against the grid boundary as an open end', () => {
    expect(openEnds([p('straight', 0, 0)])).toHaveLength(2)
  })
})

describe('autoRotate', () => {
  it('keeps a rotation that already connects', () => {
    const s = p('straight', 5, 5)
    expect(autoRotate([s], { type: 'straight', gridX: 5, gridZ: 6, rotation: 0 })).toBe(0)
  })
  it('turns clockwise to the first rotation that connects', () => {
    const s = p('straight', 5, 5)
    expect(autoRotate([s], { type: 'straight', gridX: 5, gridZ: 6, rotation: 90 })).toBe(180)
    const w = p('straight', 5, 5, 90)
    expect(autoRotate([w], { type: 'straight', gridX: 6, gridZ: 5, rotation: 0 })).toBe(90)
    expect(autoRotate([s], { type: 'curve', gridX: 5, gridZ: 4, rotation: 0 })).toBe(0)
    const top = p('straight', 5, 3)
    expect(autoRotate([top], { type: 'curve', gridX: 5, gridZ: 4, rotation: 0 })).toBe(180)
  })
  it('turns a buffer to face the track', () => {
    const s = p('straight', 5, 5)
    expect(autoRotate([s], { type: 'buffer', gridX: 5, gridZ: 6, rotation: 0 })).toBe(180)
    expect(autoRotate([s], { type: 'buffer', gridX: 5, gridZ: 4, rotation: 0 })).toBe(0)
  })
  it('does nothing with no facing open end', () => {
    const across = p('straight', 5, 5, 90)
    expect(autoRotate([across], { type: 'straight', gridX: 5, gridZ: 6, rotation: 90 })).toBe(90)
    expect(autoRotate([], { type: 'straight', gridX: 5, gridZ: 6, rotation: 90 })).toBe(90)
  })
  it('leaves decorations alone', () => {
    const s = p('straight', 5, 5)
    expect(autoRotate([s], { type: 'house', gridX: 5, gridZ: 6, rotation: 90 })).toBe(90)
  })
})
