import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { installTestHook } from '../testHook'
import { useGameStore } from '@/store/gameStore'

const hook = () => window.__DIORAMA__!

beforeAll(() => installTestHook())
beforeEach(() => {
  localStorage.clear()
  useGameStore.getState().newDiorama()
})

describe('window.__DIORAMA__', () => {
  it('is installed in development and test runs', () => {
    expect(hook()).toBeDefined()
  })

  it('returns exactly the §9 GameState fields', () => {
    expect(Object.keys(hook().getState()).sort()).toEqual(
      [
        'pieces',
        'selectedTool',
        'selectedPieceId',
        'mode',
        'driveMode',
        'setting',
        'startFacing',
        'dioramaId',
        'dioramaName',
        'isDirty',
      ].sort(),
    )
  })

  it('places, moves, rotates and removes with the UI validation', () => {
    const start = hook().getSoundLog().length
    const placed = hook().placePiece('straight', 2, 2, 90)
    expect(placed.ok).toBe(true)
    expect(hook().placePiece('house', 2, 2)).toEqual({ ok: false, reason: 'on_track' })
    expect(hook().placePiece('station', 5, 5).ok).toBe(true)
    expect(hook().placePiece('station', 6, 6)).toEqual({ ok: false, reason: 'station_limit' })
    expect(hook().movePiece(placed.id!, 3, 2)).toEqual({ ok: true })
    expect(hook().rotatePiece(placed.id!)).toEqual({ ok: true })
    expect(hook().getState().pieces.find((p) => p.id === placed.id)).toMatchObject({ gridX: 3, rotation: 180 })
    expect(hook().removePiece(placed.id!)).toEqual({ ok: true })
    expect(hook().getSoundLog().slice(start)).toEqual(['place', 'invalid', 'place', 'invalid', 'move', 'rotate', 'delete'])
  })

  it('reports connections as pairs of track ids', () => {
    const a = hook().placePiece('straight', 2, 2, 0).id!
    const b = hook().placePiece('straight', 2, 3, 0).id!
    expect(hook().getConnections()).toEqual([[a, b].sort()])
  })

  it('switches modes and drive modes, and exposes the parked train', () => {
    expect(hook().getTrain()).toBeNull()
    expect(hook().setMode('play')).toEqual({ ok: false, reason: 'no_station' })
    const station = hook().placePiece('station', 5, 5).id!
    expect(hook().getTrain()).toEqual({
      pieceId: station,
      progress: 0.5,
      moving: false,
      direction: 'forward',
      speed: 0,
    })
    expect(hook().setMode('play')).toEqual({ ok: true })
    hook().setDriveMode('manual')
    expect(hook().getState().driveMode).toBe('manual')
    expect(hook().setMode('build')).toEqual({ ok: true })
    expect(hook().getState().mode).toBe('build')
  })

  it('logs sounds by event name in order', () => {
    const start = hook().getSoundLog().length
    hook().placePiece('house', 1, 1)
    hook().placePiece('house', 1, 1)
    expect(hook().getSoundLog().slice(start)).toEqual(['place', 'invalid'])
  })
})
