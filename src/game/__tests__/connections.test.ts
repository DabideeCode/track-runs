import { describe, expect, it } from 'vitest'
import { getConnections, openEnds } from '../connections'
import { pieceConnectors, rotateDir, worldToTile, tileCenter } from '../grid'
import type { Piece, PieceType, Rotation } from '../types'

const p = (id: string, type: PieceType, gridX: number, gridZ: number, rotation: Rotation = 0): Piece => ({
  id,
  type,
  gridX,
  gridZ,
  rotation,
})

describe('grid', () => {
  it('maps tile centres per §4', () => {
    expect(tileCenter(0, 0)).toEqual({ x: -7.5, z: -7.5 })
    expect(tileCenter(15, 15)).toEqual({ x: 7.5, z: 7.5 })
  })

  it('maps world points to the nearest tile, or null off-grid', () => {
    expect(worldToTile(-7.9, -7.1)).toEqual({ gx: 0, gz: 0 })
    expect(worldToTile(0.2, -0.2)).toEqual({ gx: 8, gz: 7 })
    expect(worldToTile(8.01, 0)).toBeNull()
    expect(worldToTile(0, -8.5)).toBeNull()
  })

  it('rotates connectors clockwise: N moves to E after one rotation', () => {
    expect(rotateDir('N', 90)).toBe('E')
    expect(rotateDir('E', 180)).toBe('W')
    expect(pieceConnectors(p('c', 'curve', 0, 0, 90)).sort()).toEqual(['S', 'W'])
  })
})

describe('getConnections', () => {
  it('connects two vertical straights on adjacent tiles', () => {
    expect(getConnections([p('a', 'straight', 5, 5), p('b', 'straight', 5, 6)])).toEqual([['a', 'b']])
  })

  it('does not connect when only one side has a connector on the shared edge', () => {
    expect(getConnections([p('a', 'straight', 5, 5), p('b', 'straight', 6, 5, 90)])).toEqual([])
  })

  it('connects a curve east edge to an east-west straight', () => {
    expect(getConnections([p('a', 'curve', 5, 5), p('b', 'straight', 6, 5, 90)])).toEqual([['a', 'b']])
  })

  it('connects a buffer south connector to a straight below it', () => {
    expect(getConnections([p('a', 'buffer', 5, 4), p('b', 'straight', 5, 5)])).toEqual([['a', 'b']])
  })

  it('finds 4 connections and no open ends in a closed 4-curve loop', () => {
    const loop = [
      p('a', 'curve', 5, 5, 0),
      p('b', 'curve', 6, 5, 90),
      p('c', 'curve', 6, 6, 180),
      p('d', 'curve', 5, 6, 270),
    ]
    expect(getConnections(loop)).toHaveLength(4)
    expect(openEnds(loop)).toEqual([])
  })

  it('reports both ends of a lone straight as open', () => {
    expect(openEnds([p('a', 'straight', 5, 5)])).toEqual([
      { pieceId: 'a', dir: 'N' },
      { pieceId: 'a', dir: 'S' },
    ])
  })

  it('ignores decorations', () => {
    expect(getConnections([p('a', 'straight', 5, 5), p('b', 'house', 5, 6)])).toEqual([])
  })
})
