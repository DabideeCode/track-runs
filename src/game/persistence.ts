import { isPieceType } from './catalog'
import { isOnGrid } from './grid'
import type { Diorama, Piece } from './types'

export const SAVE_KEY = 'wooden-diorama:v1'
export const AUDIO_KEY = 'wooden-diorama:audio'
export const PREFS_KEY = 'wooden-diorama:prefs'

export interface AudioSettings {
  muted: boolean
  musicVolume: number
  sfxVolume: number
}

const DEFAULT_AUDIO: AudioSettings = { muted: false, musicVolume: 0.45, sfxVolume: 0.8 }

const isVolume = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1

const readJson = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`Track: could not write ${key}`, error)
  }
}

export const loadAudioSettings = (): AudioSettings => {
  const stored = readJson(AUDIO_KEY)
  if (!isObject(stored)) return DEFAULT_AUDIO
  return {
    muted: stored.muted === true,
    musicVolume: isVolume(stored.musicVolume) ? stored.musicVolume : DEFAULT_AUDIO.musicVolume,
    sfxVolume: isVolume(stored.sfxVolume) ? stored.sfxVolume : DEFAULT_AUDIO.sfxVolume,
  }
}

export const saveAudioSettings = (settings: AudioSettings) => writeJson(AUDIO_KEY, settings)

export const loadLowQuality = () => {
  const stored = readJson(PREFS_KEY)
  return isObject(stored) && stored.lowQuality === true
}

export const saveLowQuality = (lowQuality: boolean) => writeJson(PREFS_KEY, { lowQuality })

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isDate = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value))

const isPiece = (value: unknown): value is Piece =>
  isObject(value) &&
  typeof value.id === 'string' &&
  isPieceType(value.type) &&
  isOnGrid(value.gridX as number, value.gridZ as number) &&
  [0, 90, 180, 270].includes(value.rotation as number)

export const isDiorama = (value: unknown): value is Diorama =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  value.name.trim().length > 0 &&
  (value.setting === 'bedroom' || value.setting === 'kitchen') &&
  (value.startFacing === 0 || value.startFacing === 180) &&
  Array.isArray(value.pieces) &&
  value.pieces.every(isPiece) &&
  isDate(value.createdAt) &&
  isDate(value.updatedAt) &&
  (value.thumbnail === undefined || typeof value.thumbnail === 'string')

/** Raw entries, corrupt ones included, so a later save does not destroy them. */
const readEntries = (): unknown[] => {
  let text: string | null
  try {
    text = localStorage.getItem(SAVE_KEY)
  } catch (error) {
    console.warn('Track: saved data could not be read', error)
    return []
  }
  if (text === null) return []
  try {
    const parsed: unknown = JSON.parse(text)
    if (isObject(parsed) && parsed.version === 1 && Array.isArray(parsed.dioramas)) {
      return parsed.dioramas
    }
    console.warn('Track: saved data has an unexpected shape and was skipped')
  } catch (error) {
    console.warn('Track: saved data is not valid JSON and was skipped', error)
  }
  try {
    localStorage.setItem(`${SAVE_KEY}:corrupt`, text)
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Nothing more to do: the data stays where it is and the menu shows no entries.
  }
  return []
}

const writeEntries = (entries: unknown[]) => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, dioramas: entries }))
    return true
  } catch (error) {
    console.warn('Track: could not write saved data', error)
    return false
  }
}

const entryId = (entry: unknown) => (isObject(entry) ? entry.id : undefined)

export const loadDioramas = (): Diorama[] =>
  readEntries()
    .filter((entry): entry is Diorama => {
      if (isDiorama(entry)) return true
      console.warn('Track: skipped a corrupt saved diorama', entryId(entry))
      return false
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

export const writeDiorama = (diorama: Diorama) => {
  const entries = readEntries()
  const index = entries.findIndex((entry) => entryId(entry) === diorama.id)
  if (index >= 0) entries[index] = diorama
  else entries.push(diorama)
  return writeEntries(entries)
}

export const deleteDiorama = (id: string) =>
  writeEntries(readEntries().filter((entry) => entryId(entry) !== id))

export const renameDiorama = (id: string, name: string) => {
  const entries = readEntries()
  const index = entries.findIndex((entry) => entryId(entry) === id)
  if (index < 0) return false
  entries[index] = { ...(entries[index] as object), name, updatedAt: new Date().toISOString() }
  return writeEntries(entries)
}

export const validateName = (name: string): string | null => {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Please enter a name.'
  if (trimmed.length > 40) return 'Names can be up to 40 characters.'
  return null
}
