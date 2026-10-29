import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIO_KEY,
  SAVE_KEY,
  deleteDiorama,
  listDioramas,
  loadAudioSettings,
  nextUntitledName,
  renameDiorama,
  saveAudioSettings,
  upsertDiorama,
  validateName,
} from '../persistence'
import type { Diorama } from '../types'

const diorama = (id: string, updatedAt: string, extra: Partial<Diorama> = {}): Diorama => ({
  id,
  name: `D ${id}`,
  setting: 'bedroom',
  startFacing: 0,
  pieces: [{ id: `${id}-a`, type: 'station', gridX: 3, gridZ: 3, rotation: 90 }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
  ...extra,
})

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

describe('dioramas in localStorage', () => {
  it('round-trips a diorama under wooden-diorama:v1', () => {
    const d = diorama('a', '2026-02-01T00:00:00.000Z')
    upsertDiorama(d)
    expect(listDioramas()).toEqual([d])
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!)).toEqual({ version: 1, dioramas: [d] })
  })

  it('lists newest first', () => {
    upsertDiorama(diorama('old', '2026-02-01T00:00:00.000Z'))
    upsertDiorama(diorama('new', '2026-03-01T00:00:00.000Z'))
    expect(listDioramas().map((d) => d.id)).toEqual(['new', 'old'])
  })

  it('replaces an existing diorama with the same id', () => {
    upsertDiorama(diorama('a', '2026-02-01T00:00:00.000Z'))
    upsertDiorama(diorama('a', '2026-02-02T00:00:00.000Z', { name: 'Renamed' }))
    expect(listDioramas()).toHaveLength(1)
    expect(listDioramas()[0].name).toBe('Renamed')
  })

  it('survives invalid JSON without throwing and warns', () => {
    localStorage.setItem(SAVE_KEY, '{not json')
    expect(listDioramas()).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('backs up unreadable data before overwriting it', () => {
    localStorage.setItem(SAVE_KEY, '{not json')
    upsertDiorama(diorama('a', '2026-02-01T00:00:00.000Z'))
    expect(localStorage.getItem(`${SAVE_KEY}:backup`)).toBe('{not json')
    expect(listDioramas()).toHaveLength(1)
  })

  it('ignores an unknown save version', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, dioramas: [diorama('a', '2026')] }))
    expect(listDioramas()).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it.each([
    ['a piece outside the grid', { pieces: [{ id: 'x', type: 'straight', gridX: 16, gridZ: 0, rotation: 0 }] }],
    ['a bad rotation', { pieces: [{ id: 'x', type: 'straight', gridX: 1, gridZ: 0, rotation: 45 }] }],
    ['an unknown piece type', { pieces: [{ id: 'x', type: 'rocket', gridX: 1, gridZ: 0, rotation: 0 }] }],
    [
      'overlapping pieces',
      {
        pieces: [
          { id: 'x', type: 'straight', gridX: 1, gridZ: 1, rotation: 0 },
          { id: 'y', type: 'house', gridX: 1, gridZ: 1, rotation: 0 },
        ],
      },
    ],
    ['a missing name', { name: undefined }],
    ['a blank name', { name: '   ' }],
    ['a bad setting', { setting: 'garden' }],
    ['pieces that are not an array', { pieces: 'lots' }],
  ])('skips a diorama with %s and keeps the good ones', (_label, bad) => {
    const good1 = diorama('g1', '2026-02-01T00:00:00.000Z')
    const good2 = diorama('g2', '2026-02-02T00:00:00.000Z')
    const broken = { ...diorama('b', '2026-02-03T00:00:00.000Z'), ...bad }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [good1, broken, good2] }))
    expect(listDioramas().map((d) => d.id)).toEqual(['g2', 'g1'])
    expect(warn).toHaveBeenCalled()
  })

  it('loads only the first of two dioramas sharing an id', () => {
    const a = diorama('same', '2026-02-01T00:00:00.000Z')
    const b = { ...diorama('same', '2026-02-02T00:00:00.000Z'), name: 'Copy' }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [a, b] }))
    expect(listDioramas()).toEqual([a])
    expect(warn).toHaveBeenCalled()
  })

  it('skips non-object entries in the dioramas array', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: [null, 3, 'x'] }))
    expect(listDioramas()).toEqual([])
  })

  it('reports failure instead of throwing when storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(upsertDiorama(diorama('a', '2026-02-01T00:00:00.000Z'))).toBe(false)
    spy.mockRestore()
    expect(upsertDiorama(diorama('a', '2026-02-01T00:00:00.000Z'))).toBe(true)
  })

  it('renames and deletes', () => {
    upsertDiorama(diorama('a', '2026-02-01T00:00:00.000Z'))
    expect(renameDiorama('a', '  Cozy loop ')).toBe(true)
    expect(listDioramas()[0].name).toBe('Cozy loop')
    expect(renameDiorama('a', '   ')).toBe(false)
    deleteDiorama('a')
    expect(listDioramas()).toEqual([])
  })
})

describe('names', () => {
  it('validates 1 to 40 characters after trimming', () => {
    expect(validateName('   ')).toBeNull()
    expect(validateName('')).toBeNull()
    expect(validateName('x'.repeat(41))).toBeNull()
    expect(validateName('x'.repeat(40))).toBe('x'.repeat(40))
    expect(validateName(' Hi ')).toBe('Hi')
  })

  it('numbers untitled dioramas, starting with the bare name', () => {
    expect(nextUntitledName([])).toBe('Untitled diorama')
    expect(nextUntitledName(['Untitled diorama'])).toBe('Untitled diorama 2')
    expect(nextUntitledName(['Untitled diorama', 'Untitled diorama 2'])).toBe('Untitled diorama 3')
    expect(nextUntitledName(['Untitled diorama 2'])).toBe('Untitled diorama')
  })
})

describe('audio settings', () => {
  it('defaults when nothing is stored or data is corrupt', () => {
    expect(loadAudioSettings()).toEqual({ muted: false, music: 60, sfx: 80 })
    localStorage.setItem(AUDIO_KEY, 'nope')
    expect(loadAudioSettings()).toEqual({ muted: false, music: 60, sfx: 80 })
  })

  it('round-trips under wooden-diorama:audio', () => {
    saveAudioSettings({ muted: true, music: 10, sfx: 20 })
    expect(AUDIO_KEY).toBe('wooden-diorama:audio')
    expect(loadAudioSettings()).toEqual({ muted: true, music: 10, sfx: 20 })
  })
})
