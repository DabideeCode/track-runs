import { CATALOGUE } from './catalogue'
import { validatePlacement } from './rules'
import type { Diorama, Piece, SaveFile } from './types'

export const SAVE_KEY = 'wooden-diorama:v1'
export const AUDIO_KEY = 'wooden-diorama:audio'
const BACKUP_KEY = `${SAVE_KEY}:backup`
export const NAME_MAX = 40
const UNTITLED = 'Untitled diorama'

export interface AudioSettings {
  muted: boolean
  /** 0–100 */
  music: number
  /** 0–100 */
  sfx: number
}

export const DEFAULT_AUDIO: AudioSettings = { muted: false, music: 60, sfx: 80 }

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Trimmed name if it is 1 to 40 characters, otherwise null (AC-1.4). */
export function validateName(name: string): string | null {
  const trimmed = (name ?? '').trim()
  return trimmed.length >= 1 && trimmed.length <= NAME_MAX ? trimmed : null
}

export function nextUntitledName(existing: string[]): string {
  const taken = new Set(existing)
  if (!taken.has(UNTITLED)) return UNTITLED
  for (let n = 2; ; n++) if (!taken.has(`${UNTITLED} ${n}`)) return `${UNTITLED} ${n}`
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function parsePiece(raw: unknown): Piece | null {
  if (!isObject(raw)) return null
  const { id, type, gridX, gridZ, rotation } = raw
  if (typeof id !== 'string' || !id) return null
  if (typeof type !== 'string' || !(type in CATALOGUE)) return null
  if (!Number.isInteger(gridX) || !Number.isInteger(gridZ)) return null
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return null
  return { id, type: type as Piece['type'], gridX: gridX as number, gridZ: gridZ as number, rotation }
}

const isIsoDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

/** A fully validated diorama, or a reason string describing what is wrong. */
function parseDiorama(raw: unknown): Diorama | string {
  if (!isObject(raw)) return 'not an object'
  const { id, name, setting, startFacing, pieces, createdAt, updatedAt, thumbnail } = raw
  if (typeof id !== 'string' || !id) return 'missing id'
  if (typeof name !== 'string' || validateName(name) === null) return 'invalid name'
  if (setting !== 'bedroom' && setting !== 'kitchen') return 'invalid setting'
  if (startFacing !== 0 && startFacing !== 180) return 'invalid startFacing'
  if (!isIsoDate(createdAt) || !isIsoDate(updatedAt)) return 'invalid dates'
  if (!Array.isArray(pieces)) return 'pieces is not an array'
  const placed: Piece[] = []
  const ids = new Set<string>()
  for (const rawPiece of pieces) {
    const piece = parsePiece(rawPiece)
    if (!piece || ids.has(piece.id)) return 'invalid piece'
    if (validatePlacement(placed, { type: piece.type, gx: piece.gridX, gz: piece.gridZ })) {
      return `piece ${piece.id} breaks placement rules`
    }
    ids.add(piece.id)
    placed.push(piece)
  }
  const d: Diorama = {
    id,
    name: name.trim(),
    setting,
    startFacing,
    pieces: placed,
    createdAt: createdAt as string,
    updatedAt: updatedAt as string,
  }
  if (typeof thumbnail === 'string' && thumbnail.startsWith('data:image/')) d.thumbnail = thumbnail
  return d
}

interface Loaded {
  file: SaveFile
  /** The raw value was present but unreadable. */
  corrupt: boolean
}

function load(): Loaded {
  const raw = storage()?.getItem(SAVE_KEY)
  if (raw == null) return { file: { version: 1, dioramas: [] }, corrupt: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('[Track] Saved dioramas are unreadable; ignoring them.')
    return { file: { version: 1, dioramas: [] }, corrupt: true }
  }
  if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.dioramas)) {
    console.warn('[Track] Saved dioramas have an unknown format; ignoring them.')
    return { file: { version: 1, dioramas: [] }, corrupt: true }
  }
  const dioramas: Diorama[] = []
  parsed.dioramas.forEach((entry, i) => {
    const result = parseDiorama(entry)
    if (typeof result === 'string') console.warn(`[Track] Skipping saved diorama #${i + 1}: ${result}.`)
    else dioramas.push(result)
  })
  return { file: { version: 1, dioramas }, corrupt: false }
}

export function loadSaveFile(): SaveFile {
  return load().file
}

/** Persist the list; false if storage is unavailable or full. */
function write(dioramas: Diorama[]): boolean {
  const store = storage()
  if (!store) return false
  try {
    const { corrupt } = load()
    if (corrupt && store.getItem(BACKUP_KEY) == null) {
      store.setItem(BACKUP_KEY, store.getItem(SAVE_KEY) ?? '')
    }
    const file: SaveFile = { version: 1, dioramas }
    store.setItem(SAVE_KEY, JSON.stringify(file))
    return true
  } catch (err) {
    console.warn('[Track] Could not write saved dioramas.', err)
    return false
  }
}

const byNewest = (a: Diorama, b: Diorama) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)

export function listDioramas(): Diorama[] {
  return [...loadSaveFile().dioramas].sort(byNewest)
}

export function getDiorama(id: string): Diorama | null {
  return loadSaveFile().dioramas.find((d) => d.id === id) ?? null
}

export function upsertDiorama(d: Diorama): boolean {
  const dioramas = loadSaveFile().dioramas.filter((x) => x.id !== d.id)
  return write([...dioramas, d])
}

export function deleteDiorama(id: string): boolean {
  return write(loadSaveFile().dioramas.filter((d) => d.id !== id))
}

export function renameDiorama(id: string, name: string): boolean {
  const valid = validateName(name)
  if (!valid) return false
  const dioramas = loadSaveFile().dioramas
  const d = dioramas.find((x) => x.id === id)
  if (!d) return false
  d.name = valid
  return write(dioramas)
}

const clampVolume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback

export function loadAudioSettings(): AudioSettings {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(AUDIO_KEY) ?? 'null')
    if (!isObject(parsed)) return { ...DEFAULT_AUDIO }
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_AUDIO.muted,
      music: clampVolume(parsed.music, DEFAULT_AUDIO.music),
      sfx: clampVolume(parsed.sfx, DEFAULT_AUDIO.sfx),
    }
  } catch {
    return { ...DEFAULT_AUDIO }
  }
}

export function saveAudioSettings(s: AudioSettings) {
  try {
    storage()?.setItem(AUDIO_KEY, JSON.stringify(s))
  } catch {
    // Storage full or blocked: settings simply won't persist.
  }
}
