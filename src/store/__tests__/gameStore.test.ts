import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../gameStore'
import { clearSoundLog, getSoundLog } from '@/audio/soundBus'
import { getConnections } from '@/game/connections'
import { AUDIO_KEY, listDioramas } from '@/game/persistence'

const s = () => useGameStore.getState()

beforeEach(() => {
  localStorage.clear()
  s().newDiorama()
  clearSoundLog()
})

describe('placing pieces', () => {
  it('adds exactly one entry and plays the place sound', () => {
    const r = s().placePiece('straight', 3, 3, 0)
    expect(r.ok).toBe(true)
    expect(s().pieces).toEqual([{ id: r.id, type: 'straight', gridX: 3, gridZ: 3, rotation: 0 }])
    expect(getSoundLog()).toEqual(['place'])
    expect(s().isDirty).toBe(true)
  })

  it('plays snap in addition to place when a connection is made', () => {
    s().placePiece('straight', 3, 3, 0)
    s().placePiece('straight', 3, 4, 0)
    expect(getSoundLog()).toEqual(['place', 'place', 'snap'])
  })

  it('rejects invalid placements with a reason, the invalid sound and no change', () => {
    s().placePiece('straight', 3, 3, 0)
    clearSoundLog()
    expect(s().placePiece('house', 3, 3)).toEqual({ ok: false, reason: 'on_track' })
    expect(s().placePiece('house', 16, 3)).toEqual({ ok: false, reason: 'out_of_bounds' })
    expect(s().pieces).toHaveLength(1)
    expect(getSoundLog()).toEqual(['invalid', 'invalid'])
  })

  it('auto-adjusts when no rotation is given, and keeps a given rotation', () => {
    s().placePiece('straight', 5, 5, 0)
    const auto = s().placePiece('curve', 5, 6)
    expect(s().pieces.find((p) => p.id === auto.id)!.rotation).toBe(180)
    const fixed = s().placePiece('curve', 4, 5, 0)
    expect(s().pieces.find((p) => p.id === fixed.id)!.rotation).toBe(0)
  })
})

describe('snap on new connections', () => {
  it('plays snap when a move swaps one connection for a new one', () => {
    s().placePiece('straight', 5, 5, 0)
    const b = s().placePiece('straight', 5, 6, 0).id!
    clearSoundLog()
    s().movePiece(b, 5, 4)
    expect(getSoundLog()).toEqual(['move', 'snap'])
  })

  it('plays snap when a rotation swaps one connection for a new one', () => {
    const curve = s().placePiece('curve', 5, 5, 0).id!
    s().placePiece('straight', 5, 6, 0)
    s().placePiece('straight', 6, 5, 90)
    s().placePiece('straight', 4, 5, 90)
    clearSoundLog()
    s().rotatePiece(curve) // S,E -> W,S: keeps S, swaps E for W
    expect(getSoundLog()).toEqual(['rotate', 'snap'])
  })
})

describe('tool and rejection state', () => {
  const rejection = { source: 'palette' as const, type: 'house' as const, tile: { gx: 1, gz: 1 }, rotation: 0 as const, at: 0 }

  it('clears a refused drop when another tool is selected', () => {
    s().setRejected(rejection)
    s().selectTool('straight')
    expect(s().rejected).toBeNull()
  })

  it('clears a refused drop when a diorama is created or opened', () => {
    s().setRejected(rejection)
    s().newDiorama()
    expect(s().rejected).toBeNull()
  })

  it('puts the station tool down once the station is placed', () => {
    s().selectTool('station')
    s().placePiece('station', 4, 4, 0)
    expect(s().selectedTool).toBeNull()
  })
})

describe('moving, rotating, deleting', () => {
  it('moves a piece and plays the move sound', () => {
    const { id } = s().placePiece('house', 1, 1)
    clearSoundLog()
    expect(s().movePiece(id!, 2, 2)).toEqual({ ok: true })
    expect(s().pieces[0]).toMatchObject({ gridX: 2, gridZ: 2 })
    expect(getSoundLog()).toEqual(['move'])
  })

  it('keeps a piece where it was when the move is invalid', () => {
    const a = s().placePiece('house', 1, 1)
    s().placePiece('house', 2, 2)
    expect(s().movePiece(a.id!, 2, 2)).toEqual({ ok: false, reason: 'occupied' })
    expect(s().pieces[0]).toMatchObject({ gridX: 1, gridZ: 1 })
  })

  it('rotates 90° clockwise and wraps', () => {
    const { id } = s().placePiece('house', 1, 1, 270)
    clearSoundLog()
    expect(s().rotatePiece(id!)).toEqual({ ok: true })
    expect(s().pieces[0].rotation).toBe(0)
    expect(getSoundLog()).toEqual(['rotate'])
  })

  it('deletes a piece and clears its selection', () => {
    const { id } = s().placePiece('house', 1, 1)
    s().selectPiece(id!)
    clearSoundLog()
    expect(s().removePiece(id!)).toEqual({ ok: true })
    expect(s().pieces).toEqual([])
    expect(s().selectedPieceId).toBeNull()
    expect(getSoundLog()).toEqual(['delete'])
  })

  it('reports not_found for unknown ids', () => {
    expect(s().removePiece('nope')).toEqual({ ok: false, reason: 'not_found' })
    expect(s().movePiece('nope', 1, 1)).toEqual({ ok: false, reason: 'not_found' })
    expect(s().rotatePiece('nope')).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('modes', () => {
  it('refuses Play mode without a station', () => {
    expect(s().setMode('play')).toEqual({ ok: false, reason: 'no_station' })
    expect(s().mode).toBe('build')
    expect(s().toast?.text).toBe('Place a station to start')
  })

  it('enters Play mode in auto driving with a whistle, and locks editing', () => {
    const { id } = s().placePiece('station', 4, 4)
    s().setDriveMode('manual')
    clearSoundLog()
    expect(s().setMode('play')).toEqual({ ok: true })
    expect(s().mode).toBe('play')
    expect(s().driveMode).toBe('auto')
    expect(getSoundLog()).toEqual(['whistle'])
    expect(s().placePiece('house', 1, 1)).toEqual({ ok: false, reason: 'play_mode' })
    expect(s().movePiece(id!, 1, 1)).toEqual({ ok: false, reason: 'play_mode' })
    expect(s().rotatePiece(id!)).toEqual({ ok: false, reason: 'play_mode' })
    expect(s().removePiece(id!)).toEqual({ ok: false, reason: 'play_mode' })
  })

  it('ignores flip direction in Play mode', () => {
    s().placePiece('station', 4, 4)
    s().flipStartFacing()
    expect(s().startFacing).toBe(180)
    s().setMode('play')
    s().flipStartFacing()
    expect(s().startFacing).toBe(180)
  })
})

describe('undo and redo', () => {
  it('undoes and redoes at least 20 steps exactly', () => {
    const snapshots = [s().pieces]
    for (let i = 0; i < 25; i++) {
      s().placePiece('house', i % 16, Math.floor(i / 16))
      snapshots.push(s().pieces)
    }
    for (let i = 24; i >= 0; i--) {
      s().undo()
      expect(s().pieces).toEqual(snapshots[i])
    }
    for (let i = 1; i <= 25; i++) {
      s().redo()
      expect(s().pieces).toEqual(snapshots[i])
    }
  })

  it('drops the redo stack after a new edit', () => {
    s().placePiece('house', 1, 1)
    s().undo()
    s().placePiece('house', 2, 2)
    s().redo()
    expect(s().pieces).toHaveLength(1)
  })
})

describe('dioramas', () => {
  it('saves name, setting, start facing and pieces, then reopens identically', () => {
    s().placePiece('station', 4, 4, 90)
    s().setSetting('kitchen')
    s().flipStartFacing()
    expect(s().saveCurrent()).toBe(true)
    expect(s().isDirty).toBe(false)
    expect(s().toast?.text).toMatch(/saved/i)
    const saved = listDioramas()
    expect(saved).toHaveLength(1)
    const before = { pieces: s().pieces, setting: s().setting, startFacing: s().startFacing, name: s().dioramaName }
    s().newDiorama()
    expect(s().dioramaName).toBe('Untitled diorama 2')
    s().openDiorama(saved[0].id)
    expect({ pieces: s().pieces, setting: s().setting, startFacing: s().startFacing, name: s().dioramaName }).toEqual(
      before,
    )
    expect(s().mode).toBe('build')
    expect(s().isDirty).toBe(false)
  })

  it('persists audio settings', () => {
    s().setAudio({ muted: true, music: 12 })
    expect(JSON.parse(localStorage.getItem(AUDIO_KEY)!)).toEqual({ muted: true, music: 12, sfx: 80 })
  })

  it('keeps connections consistent with the domain helper', () => {
    s().placePiece('straight', 3, 3, 0)
    s().placePiece('straight', 3, 4, 0)
    expect(getConnections(s().pieces)).toHaveLength(1)
  })
})
