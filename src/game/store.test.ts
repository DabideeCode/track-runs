import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSoundLog, getSoundLog } from '@/audio/log'
import { loadDioramas, SAVE_KEY } from './persistence'
import { useGame, uniqueName } from './store'
import { createTestHook } from './testHook'
import { trainRuntime } from './trainRuntime'
import type { Diorama, Piece } from './types'

const memoryStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
  }
}

const game = () => useGame.getState()
const hook = createTestHook()

const saved = (over: Partial<Diorama> = {}): Diorama => ({
  id: 'a',
  name: 'A',
  setting: 'kitchen',
  startFacing: 180,
  pieces: [{ id: 'x', type: 'straight', gridX: 1, gridZ: 2, rotation: 90 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...over,
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  game().newDiorama()
  clearSoundLog()
})

describe('placing through the hook', () => {
  it('adds exactly one piece and logs the place sound', () => {
    const result = hook.placePiece('straight', 3, 3, 0)
    expect(result.ok).toBe(true)
    expect(hook.getState().pieces).toHaveLength(1)
    expect(hook.getState().pieces[0]).toMatchObject({ id: result.id, gridX: 3, gridZ: 3 })
    expect(hook.getSoundLog()).toEqual(['place'])
    expect(hook.getState().isDirty).toBe(true)
  })
  it('plays snap after place on a new connection', () => {
    hook.placePiece('straight', 3, 3, 0)
    clearSoundLog()
    hook.placePiece('straight', 3, 4, 0)
    expect(hook.getSoundLog()).toEqual(['place', 'snap'])
    expect(hook.getConnections()).toHaveLength(1)
  })
  it('auto-adjusts only when the rotation is omitted', () => {
    hook.placePiece('straight', 3, 3, 0)
    const auto = hook.placePiece('buffer', 3, 4)
    expect(hook.getState().pieces.find((p) => p.id === auto.id)!.rotation).toBe(180)
    const given = hook.placePiece('straight', 3, 2, 90)
    expect(hook.getState().pieces.find((p) => p.id === given.id)!.rotation).toBe(90)
  })
  it('returns every reason code and plays invalid', () => {
    hook.placePiece('station', 3, 3, 0)
    hook.placePiece('house', 5, 5, 0)
    clearSoundLog()
    expect(hook.placePiece('car', 5, 5, 0)).toEqual({ ok: false, reason: 'occupied' })
    expect(hook.placePiece('car', 3, 3, 0)).toEqual({ ok: false, reason: 'on_track' })
    expect(hook.placePiece('hill', 15, 3, 0)).toEqual({ ok: false, reason: 'out_of_bounds' })
    expect(hook.placePiece('station', 9, 9, 0)).toEqual({ ok: false, reason: 'station_limit' })
    expect(hook.getSoundLog()).toEqual(['invalid', 'invalid', 'invalid', 'invalid'])
    expect(hook.getState().pieces).toHaveLength(2)
  })
  it('refuses all edits in play mode', () => {
    const { id } = hook.placePiece('station', 3, 3, 0)
    hook.setMode('play')
    expect(hook.placePiece('car', 5, 5, 0)).toEqual({ ok: false, reason: 'play_mode' })
    expect(hook.movePiece(id!, 4, 4)).toEqual({ ok: false, reason: 'play_mode' })
    expect(hook.rotatePiece(id!)).toEqual({ ok: false, reason: 'play_mode' })
    expect(hook.removePiece(id!)).toEqual({ ok: false, reason: 'play_mode' })
    hook.setMode('build')
  })
  it('reports not_found for unknown ids', () => {
    expect(hook.movePiece('nope', 1, 1)).toEqual({ ok: false, reason: 'not_found' })
    expect(hook.rotatePiece('nope')).toEqual({ ok: false, reason: 'not_found' })
    expect(hook.removePiece('nope')).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('moving, rotating, removing', () => {
  it('moves and logs move then snap', () => {
    hook.placePiece('straight', 3, 3, 0)
    const { id } = hook.placePiece('straight', 8, 8, 0)
    clearSoundLog()
    expect(hook.movePiece(id!, 3, 4).ok).toBe(true)
    expect(hook.getSoundLog()).toEqual(['move', 'snap'])
  })
  it('leaves an invalid move where it was', () => {
    hook.placePiece('house', 3, 3, 0)
    const { id } = hook.placePiece('straight', 8, 8, 0)
    expect(hook.movePiece(id!, 3, 3)).toEqual({ ok: false, reason: 'occupied' })
    expect(hook.getState().pieces.find((p) => p.id === id)).toMatchObject({ gridX: 8, gridZ: 8 })
  })
  it('rotates 90 degrees clockwise and wraps', () => {
    const { id } = hook.placePiece('curve', 3, 3, 270)
    expect(hook.rotatePiece(id!).ok).toBe(true)
    expect(hook.getState().pieces[0].rotation).toBe(0)
  })
  it('snaps when a rotation makes a connection', () => {
    hook.placePiece('straight', 3, 3, 0)
    const { id } = hook.placePiece('straight', 3, 4, 90)
    clearSoundLog()
    hook.rotatePiece(id!)
    expect(hook.getSoundLog()).toEqual(['rotate', 'snap'])
  })
  it('keeps a hill footprint when rotated', () => {
    const { id } = hook.placePiece('hill', 14, 14, 0)
    expect(hook.rotatePiece(id!).ok).toBe(true)
    expect(hook.placePiece('car', 15, 15, 0)).toEqual({ ok: false, reason: 'occupied' })
  })
  it('clears the selection when the selected piece is removed', () => {
    const { id } = hook.placePiece('straight', 3, 3, 0)
    game().selectPiece(id!)
    hook.removePiece(id!)
    expect(hook.getState().selectedPieceId).toBeNull()
    expect(hook.getSoundLog()).toContain('delete')
  })
})

describe('station drags', () => {
  it('cannot duplicate the station through a failed drag', () => {
    const { id } = hook.placePiece('station', 3, 3, 0)
    hook.placePiece('house', 9, 9, 0)
    game().dragFromBoard(id!, 0, 0)
    game().dragUpdate({ x: 1.5, z: 1.5 }, { gridX: 9, gridZ: 9 })
    expect(game().drag!.valid).toBe(false)
    game().dragEnd()
    expect(hook.getState().pieces.filter((p) => p.type === 'station')).toHaveLength(1)
    expect(hook.getState().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3 })
    expect(hook.placePiece('station', 12, 12, 0)).toEqual({ ok: false, reason: 'station_limit' })
  })
})

describe('drag', () => {
  it('places from the palette, selects it, restores the tool and adds one entry', () => {
    game().dragFromPalette('straight')
    expect(game().selectedTool).toBeNull()
    game().dragUpdate({ x: 0, z: 0 }, { gridX: 8, gridZ: 8 })
    game().dragEnd()
    expect(hook.getState().pieces).toHaveLength(1)
    expect(hook.getState().selectedPieceId).toBe(hook.getState().pieces[0].id)
    expect(hook.getSoundLog()).toEqual(['pickup', 'place'])
    expect(game().drag).toBeNull()
  })
  it('cancels off the grid with the invalid sound', () => {
    game().dragFromPalette('straight')
    game().dragUpdate(null, null)
    game().dragEnd()
    expect(hook.getState().pieces).toHaveLength(0)
    expect(hook.getSoundLog()).toEqual(['pickup', 'invalid'])
  })
  it('escape cancels a drag and leaves the piece', () => {
    const { id } = hook.placePiece('straight', 3, 3, 0)
    game().dragFromBoard(id!, 0, 0)
    game().dragUpdate({ x: 0, z: 0 }, { gridX: 8, gridZ: 8 })
    game().escape()
    expect(game().drag).toBeNull()
    expect(hook.getState().pieces[0]).toMatchObject({ gridX: 3, gridZ: 3 })
  })
  it('escape deselects the tool when no drag is active', () => {
    game().selectTool('house')
    expect(game().selectedTool).toBe('house')
    game().escape()
    expect(game().selectedTool).toBeNull()
  })
  it('R turns the drag ghost, and an invalid drop keeps the old rotation', () => {
    const { id } = hook.placePiece('straight', 3, 3, 0)
    hook.placePiece('house', 9, 9, 0)
    game().dragFromBoard(id!, 0, 0)
    game().rotateSelection()
    expect(game().drag!.rotation).toBe(90)
    expect(hook.getState().pieces[0].rotation).toBe(0)
    game().dragUpdate({ x: 1.5, z: 1.5 }, { gridX: 9, gridZ: 9 })
    game().dragEnd()
    expect(hook.getState().pieces[0].rotation).toBe(0)
  })
  it('moving a dragged piece applies the ghost rotation', () => {
    const { id } = hook.placePiece('straight', 3, 3, 0)
    game().dragFromBoard(id!, 0, 0)
    game().rotateSelection()
    game().dragUpdate({ x: 0, z: 0 }, { gridX: 10, gridZ: 10 })
    game().dragEnd()
    expect(hook.getState().pieces[0]).toMatchObject({ gridX: 10, gridZ: 10, rotation: 90 })
  })
  it('keeps the grab offset of a hill', () => {
    const { id } = hook.placePiece('hill', 3, 3, 0)
    game().dragFromBoard(id!, 1, 1)
    game().dragUpdate({ x: 0, z: 0 }, { gridX: 8, gridZ: 8 })
    game().dragEnd()
    expect(hook.getState().pieces[0]).toMatchObject({ gridX: 7, gridZ: 7 })
  })
})

describe('clicking with a tool', () => {
  it('places and keeps the tool', () => {
    game().selectTool('pineTree')
    game().clickTile(4, 4)
    game().clickTile(5, 4)
    expect(hook.getState().pieces).toHaveLength(2)
    expect(game().selectedTool).toBe('pineTree')
  })
  it('disables a second station through the tool too', () => {
    hook.placePiece('station', 3, 3, 0)
    game().selectTool('station')
    expect(game().selectedTool).toBeNull()
  })
  it('deselects the tool when the last station spot is taken', () => {
    game().selectTool('station')
    game().clickTile(4, 4)
    expect(game().selectedTool).toBeNull()
  })
})

describe('undo', () => {
  it('undoes and redoes place, move, rotate and delete', () => {
    const { id } = hook.placePiece('straight', 3, 3, 0)
    hook.movePiece(id!, 4, 4)
    hook.rotatePiece(id!)
    hook.removePiece(id!)
    game().undo()
    expect(hook.getState().pieces).toHaveLength(1)
    game().undo()
    expect(hook.getState().pieces[0].rotation).toBe(0)
    game().undo()
    expect(hook.getState().pieces[0].gridX).toBe(3)
    game().undo()
    expect(hook.getState().pieces).toHaveLength(0)
    game().redo()
    game().redo()
    game().redo()
    game().redo()
    expect(hook.getState().pieces).toHaveLength(0)
  })
  it('keeps at least 20 steps', () => {
    for (let i = 0; i < 25; i++) hook.placePiece('car', i % 16, Math.floor(i / 16), 0)
    for (let i = 0; i < 20; i++) game().undo()
    expect(hook.getState().pieces).toHaveLength(5)
  })
  it('clears redo after a new edit', () => {
    hook.placePiece('car', 1, 1, 0)
    game().undo()
    hook.placePiece('car', 2, 2, 0)
    game().redo()
    expect(hook.getState().pieces).toHaveLength(1)
    expect(hook.getState().pieces[0].gridX).toBe(2)
  })
  it('does nothing in play mode', () => {
    hook.placePiece('station', 3, 3, 0)
    hook.setMode('play')
    game().undo()
    expect(hook.getState().pieces).toHaveLength(1)
    hook.setMode('build')
  })
  it('clears the selection if undo removes the selected piece', () => {
    const { id } = hook.placePiece('car', 1, 1, 0)
    game().selectPiece(id!)
    game().undo()
    expect(hook.getState().selectedPieceId).toBeNull()
  })
})

describe('modes', () => {
  it('refuses play without a station and shows the message', () => {
    expect(hook.setMode('play')).toEqual({ ok: false, reason: 'no_station' })
    expect(hook.getState().mode).toBe('build')
    expect(game().toast?.message).toBe('Place a station to start')
  })
  it('enters play in auto, moving, with the whistle', () => {
    hook.placePiece('station', 3, 3, 0)
    hook.placePiece('straight', 3, 2, 0)
    hook.setDriveMode('manual')
    clearSoundLog()
    expect(hook.setMode('play')).toEqual({ ok: true })
    expect(hook.getState().driveMode).toBe('auto')
    expect(hook.getSoundLog()).toEqual(['whistle'])
    trainRuntime.tick(0.2)
    expect(hook.getTrain()!.moving).toBe(true)
    expect(hook.getSoundLog()).toEqual(['whistle', 'chug'])
    hook.setMode('build')
  })
  it('clears tools and selection entering play', () => {
    const { id } = hook.placePiece('station', 3, 3, 0)
    game().selectPiece(id!)
    hook.setMode('play')
    expect(hook.getState().selectedPieceId).toBeNull()
    expect(hook.getState().selectedTool).toBeNull()
    hook.setMode('build')
  })
  it('parks the train on return to build', () => {
    const station = hook.placePiece('station', 3, 8, 0)
    for (let z = 0; z < 8; z++) hook.placePiece('straight', 3, z, 0)
    hook.setMode('play')
    for (let i = 0; i < 4; i++) trainRuntime.tick(0.5)
    expect(hook.getTrain()!.pieceId).not.toBe(station.id)
    hook.setMode('build')
    expect(hook.getTrain()).toMatchObject({
      pieceId: station.id,
      moving: false,
      speed: 0,
      direction: 'forward',
    })
    expect(hook.getTrain()!.progress).toBeCloseTo(0.5)
  })
  it('stops a held key from running on after leaving play', () => {
    const { id } = hook.placePiece('station', 3, 8, 0)
    for (let z = 0; z < 8; z++) hook.placePiece('straight', 3, z, 0)
    hook.setMode('play')
    hook.setDriveMode('manual')
    trainRuntime.setKey('forward', true)
    trainRuntime.tick(0.2)
    hook.setMode('build')
    hook.setMode('play')
    hook.setDriveMode('manual')
    trainRuntime.tick(0.5)
    expect(hook.getTrain()).toMatchObject({ pieceId: id, speed: 0 })
    hook.setMode('build')
  })
  it('drops held keys when the window loses focus', () => {
    hook.placePiece('station', 3, 8, 0)
    for (let z = 0; z < 8; z++) hook.placePiece('straight', 3, z, 0)
    hook.setMode('play')
    hook.setDriveMode('manual')
    trainRuntime.setKey('forward', true)
    trainRuntime.tick(0.3)
    trainRuntime.clearKeys()
    trainRuntime.tick(0.6)
    expect(hook.getTrain()!.speed).toBe(0)
    hook.setMode('build')
  })
  it('returns null for the train without a station', () => {
    expect(hook.getTrain()).toBeNull()
  })
  it('flips the start facing and marks the diorama dirty', () => {
    const before = hook.getState().isDirty
    expect(before).toBe(false)
    game().flipDirection()
    expect(hook.getState().startFacing).toBe(180)
    expect(hook.getState().isDirty).toBe(true)
  })
  it('does not flip or undo into edits during play', () => {
    hook.placePiece('station', 3, 3, 0)
    hook.setMode('play')
    game().flipDirection()
    expect(hook.getState().startFacing).toBe(0)
    hook.setMode('build')
  })
})

describe('naming', () => {
  it('picks the first free untitled name', () => {
    expect(uniqueName([])).toBe('Untitled diorama')
    expect(uniqueName(['Untitled diorama'])).toBe('Untitled diorama 2')
    expect(uniqueName(['Untitled diorama', 'Untitled diorama 2'])).toBe('Untitled diorama 3')
    expect(uniqueName(['Untitled diorama', 'Untitled diorama 3'])).toBe('Untitled diorama 2')
  })
})

describe('saving', () => {
  it('creates an entry, clears dirty and toasts', () => {
    hook.placePiece('straight', 3, 3, 0)
    game().save()
    expect(hook.getState().isDirty).toBe(false)
    expect(hook.getState().dioramaId).toBeTruthy()
    expect(game().toast?.message).toMatch(/saved/i)
    const [entry] = loadDioramas()
    expect(entry.name).toBe('Untitled diorama')
    expect(entry.pieces).toEqual(hook.getState().pieces)
  })
  it('updates the same entry on later saves, keeping createdAt', () => {
    hook.placePiece('straight', 3, 3, 0)
    game().save()
    const created = loadDioramas()[0].createdAt
    hook.placePiece('straight', 3, 4, 0)
    game().save()
    expect(loadDioramas()).toHaveLength(1)
    expect(loadDioramas()[0].createdAt).toBe(created)
  })
  it('opens a saved diorama exactly', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [saved()] }))
    game().openDiorama('a')
    const state = hook.getState()
    expect(state).toMatchObject({
      mode: 'build',
      setting: 'kitchen',
      startFacing: 180,
      dioramaName: 'A',
      dioramaId: 'a',
      isDirty: false,
    })
    expect(state.pieces).toEqual(saved().pieces)
  })
  it('names new dioramas around existing saves', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 1, dioramas: [saved({ name: 'Untitled diorama' })] }),
    )
    game().newDiorama()
    expect(hook.getState().dioramaName).toBe('Untitled diorama 2')
  })
  it('tells the user when storage is full', () => {
    hook.placePiece('straight', 3, 3, 0)
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    game().save()
    expect(hook.getState().isDirty).toBe(true)
    expect(game().toast?.message).toMatch(/could not/i)
  })
})

describe('corrupt storage', () => {
  it('survives bad JSON and sets it aside', () => {
    localStorage.setItem(SAVE_KEY, '{not json')
    expect(loadDioramas()).toEqual([])
    expect(console.warn).toHaveBeenCalled()
    expect(localStorage.getItem(`${SAVE_KEY}:corrupt`)).toBe('{not json')
  })
  it('survives the wrong shape', () => {
    for (const value of ['null', '42', '[]', '{"version":2,"dioramas":[]}', '{"version":1}']) {
      localStorage.setItem(SAVE_KEY, value)
      expect(loadDioramas()).toEqual([])
    }
  })
  it.each([
    ['missing name', { name: undefined }],
    ['blank name', { name: '  ' }],
    ['bad setting', { setting: 'moon' }],
    ['bad facing', { startFacing: 90 }],
    ['pieces not array', { pieces: 'x' }],
    ['bad piece type', { pieces: [{ id: 'x', type: 'dragon', gridX: 1, gridZ: 1, rotation: 0 }] }],
    ['off-grid piece', { pieces: [{ id: 'x', type: 'car', gridX: 99, gridZ: 1, rotation: 0 }] }],
    ['bad rotation', { pieces: [{ id: 'x', type: 'car', gridX: 1, gridZ: 1, rotation: 45 }] }],
    ['null piece', { pieces: [null] }],
    ['bad date', { updatedAt: 'yesterday' }],
  ])('skips an entry with %s, keeps good ones and warns', (_name, over) => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 1, dioramas: [saved({ id: 'good' }), { ...saved({ id: 'bad' }), ...over }, 7] }),
    )
    expect(loadDioramas().map((d) => d.id)).toEqual(['good'])
    expect(console.warn).toHaveBeenCalled()
  })
  it('does not delete a corrupt entry on a later save', () => {
    const bad = { id: 'bad', name: 3 }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [saved(), bad] }))
    hook.placePiece('straight', 3, 3, 0)
    game().save()
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!)
    expect(raw.dioramas).toContainEqual(bad)
    expect(raw.dioramas).toHaveLength(3)
  })
  it('sorts newest first', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        dioramas: [
          saved({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
          saved({ id: 'new', updatedAt: '2026-03-01T00:00:00.000Z' }),
          saved({ id: 'mid', updatedAt: '2026-02-01T00:00:00.000Z' }),
        ],
      }),
    )
    expect(loadDioramas().map((d) => d.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('getState', () => {
  it('is plain data with the Section 9 fields', () => {
    const state = hook.getState()
    expect(Object.keys(state).sort()).toEqual(
      [
        'dioramaId',
        'dioramaName',
        'driveMode',
        'isDirty',
        'mode',
        'pieces',
        'selectedPieceId',
        'selectedTool',
        'setting',
        'startFacing',
      ].sort(),
    )
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    const pieces: Piece[] = state.pieces
    expect(pieces).toEqual([])
  })
})
