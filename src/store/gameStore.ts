import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { playSound } from '@/audio/soundBus'
import { connectionKeys } from '@/game/connections'
import {
  getDiorama,
  listDioramas,
  loadAudioSettings,
  nextUntitledName,
  saveAudioSettings,
  upsertDiorama,
  type AudioSettings,
} from '@/game/persistence'
import { autoAdjustRotation, validatePlacement } from '@/game/rules'
import { startTrain, stopTrain } from '@/game/trainRuntime'
import type {
  ActionResult,
  Diorama,
  DriveMode,
  GameState,
  Mode,
  Piece,
  PieceType,
  ReasonCode,
  Rotation,
  Setting,
  Tile,
} from '@/game/types'

const HISTORY_LIMIT = 50

export interface DragState {
  source: 'palette' | 'piece'
  type: PieceType
  /** The piece being moved (source 'piece'). */
  pieceId?: string
  rotation: Rotation
  tile: Tile | null
  valid: boolean
  /** False until the pointer has actually travelled onto the board. */
  active: boolean
}

/** A drop that was refused: the scene shakes it before it returns or vanishes (§7.2). */
export interface Rejection {
  source: 'palette' | 'piece'
  type: PieceType
  pieceId?: string
  tile: Tile | null
  rotation: Rotation
  at: number
}

export type ChangeKind = 'place' | 'move' | 'rotate' | 'delete' | 'undo' | 'load'

export interface Store extends GameState {
  screen: 'menu' | 'playfield'
  history: Piece[][]
  future: Piece[][]
  lastChange: { kind: ChangeKind; id?: string; n: number }
  toast: { text: string; n: number } | null
  cameraResetN: number
  lowQuality: boolean
  audio: AudioSettings
  drag: DragState | null
  hoverTile: Tile | null
  rejected: Rejection | null

  placePiece(type: PieceType, gx: number, gz: number, rotation?: Rotation, opts?: { autoAdjust?: boolean }): ActionResult
  movePiece(id: string, gx: number, gz: number, rotation?: Rotation): ActionResult
  rotatePiece(id: string): ActionResult
  removePiece(id: string): ActionResult
  undo(): void
  redo(): void
  setMode(mode: Mode): ActionResult
  setDriveMode(mode: DriveMode): void
  setSetting(setting: Setting): void
  flipStartFacing(): void
  selectTool(tool: PieceType | null): void
  selectPiece(id: string | null): void
  newDiorama(): void
  openDiorama(id: string): boolean
  saveCurrent(opts?: { auto?: boolean; thumbnail?: string }): boolean
  goToMenu(): void
  showToast(text: string): void
  setAudio(patch: Partial<AudioSettings>): void
  resetCamera(): void
  setLowQuality(on: boolean): void
  setDrag(drag: DragState | null): void
  setHoverTile(tile: Tile | null): void
  setRejected(r: Rejection | null): void
}

const fail = (reason: ReasonCode): ActionResult => {
  playSound('invalid')
  return { ok: false, reason }
}

export const useGameStore = create<Store>()((set, get) => {
  /** Commit a new pieces array as one undoable edit, with its sounds. */
  const commit = (pieces: Piece[], kind: ChangeKind, id: string | undefined, sound: 'place' | 'move' | 'rotate' | 'delete') => {
    const before = get().pieces
    // Snap whenever a connection exists that did not before (AC-7.5), even if another one was lost.
    const had = new Set(connectionKeys(before))
    const madeConnection = sound !== 'delete' && connectionKeys(pieces).some((key) => !had.has(key))
    set((s) => ({
      pieces,
      history: [...s.history, before].slice(-HISTORY_LIMIT),
      future: [],
      isDirty: true,
      lastChange: { kind, id, n: s.lastChange.n + 1 },
    }))
    playSound(sound)
    if (madeConnection) playSound('snap')
  }

  const editable = (): ReasonCode | null => (get().mode === 'play' ? 'play_mode' : null)

  const loadInto = (d: Pick<Diorama, 'pieces' | 'setting' | 'startFacing' | 'name'> & { id: string | null }) => {
    stopTrain()
    set((s) => ({
      screen: 'playfield',
      pieces: d.pieces,
      setting: d.setting,
      startFacing: d.startFacing,
      dioramaId: d.id,
      dioramaName: d.name,
      isDirty: false,
      mode: 'build',
      driveMode: 'auto',
      selectedTool: null,
      selectedPieceId: null,
      history: [],
      future: [],
      drag: null,
      hoverTile: null,
      rejected: null,
      lastChange: { kind: 'load', n: s.lastChange.n + 1 },
      cameraResetN: s.cameraResetN + 1,
    }))
  }

  return {
    pieces: [],
    selectedTool: null,
    selectedPieceId: null,
    mode: 'build',
    driveMode: 'auto',
    setting: 'bedroom',
    startFacing: 0,
    dioramaId: null,
    dioramaName: 'Untitled diorama',
    isDirty: false,

    screen: 'menu',
    history: [],
    future: [],
    lastChange: { kind: 'load', n: 0 },
    toast: null,
    cameraResetN: 0,
    lowQuality: false,
    audio: loadAudioSettings(),
    drag: null,
    hoverTile: null,
    rejected: null,

    placePiece(type, gx, gz, rotation, opts) {
      const locked = editable()
      if (locked) return fail(locked)
      const { pieces } = get()
      const reason = validatePlacement(pieces, { type, gx, gz })
      if (reason) return fail(reason)
      const adjust = rotation === undefined || opts?.autoAdjust
      const rot = adjust ? autoAdjustRotation(pieces, { type, gx, gz, rotation: rotation ?? 0 }) : rotation!
      const piece: Piece = { id: nanoid(10), type, gridX: gx, gridZ: gz, rotation: rot }
      commit([...pieces, piece], 'place', piece.id, 'place')
      // Only one station is allowed (AC-8.4): put the station tool down once it is used.
      if (type === 'station' && get().selectedTool === 'station') set({ selectedTool: null })
      return { ok: true, id: piece.id }
    },

    movePiece(id, gx, gz, rotation) {
      const locked = editable()
      if (locked) return fail(locked)
      const { pieces } = get()
      const piece = pieces.find((p) => p.id === id)
      if (!piece) return fail('not_found')
      const reason = validatePlacement(pieces, { type: piece.type, gx, gz }, id)
      if (reason) return fail(reason)
      const rot = autoAdjustRotation(pieces, { type: piece.type, gx, gz, rotation: rotation ?? piece.rotation }, id)
      if (gx === piece.gridX && gz === piece.gridZ && rot === piece.rotation) {
        playSound('move')
        return { ok: true }
      }
      const moved: Piece = { ...piece, gridX: gx, gridZ: gz, rotation: rot }
      commit(
        pieces.map((p) => (p.id === id ? moved : p)),
        'move',
        id,
        'move',
      )
      return { ok: true }
    },

    rotatePiece(id) {
      const locked = editable()
      if (locked) return fail(locked)
      const { pieces } = get()
      const piece = pieces.find((p) => p.id === id)
      if (!piece) return fail('not_found')
      const rotation = ((piece.rotation + 90) % 360) as Rotation
      commit(
        pieces.map((p) => (p.id === id ? { ...p, rotation } : p)),
        'rotate',
        id,
        'rotate',
      )
      return { ok: true }
    },

    removePiece(id) {
      const locked = editable()
      if (locked) return fail(locked)
      const { pieces, selectedPieceId } = get()
      if (!pieces.some((p) => p.id === id)) return fail('not_found')
      commit(
        pieces.filter((p) => p.id !== id),
        'delete',
        id,
        'delete',
      )
      if (selectedPieceId === id) set({ selectedPieceId: null })
      return { ok: true }
    },

    undo() {
      const { history, pieces, mode } = get()
      if (mode === 'play' || history.length === 0) return
      set((s) => ({
        pieces: history[history.length - 1],
        history: history.slice(0, -1),
        future: [pieces, ...s.future],
        isDirty: true,
        selectedPieceId: null,
        lastChange: { kind: 'undo', n: s.lastChange.n + 1 },
      }))
    },

    redo() {
      const { future, pieces, mode } = get()
      if (mode === 'play' || future.length === 0) return
      set((s) => ({
        pieces: future[0],
        future: future.slice(1),
        history: [...s.history, pieces].slice(-HISTORY_LIMIT),
        isDirty: true,
        selectedPieceId: null,
        lastChange: { kind: 'undo', n: s.lastChange.n + 1 },
      }))
    },

    setMode(mode) {
      const s = get()
      if (mode === s.mode) return { ok: true }
      if (mode === 'play') {
        if (!s.pieces.some((p) => p.type === 'station')) {
          get().showToast('Place a station to start')
          return { ok: false, reason: 'no_station' }
        }
        startTrain(s.pieces, s.startFacing)
        set({ mode: 'play', driveMode: 'auto', selectedTool: null, selectedPieceId: null, drag: null })
        playSound('whistle')
      } else {
        stopTrain()
        set({ mode: 'build' })
      }
      return { ok: true }
    },

    setDriveMode(driveMode) {
      set({ driveMode })
    },

    setSetting(setting) {
      if (setting !== get().setting) set({ setting, isDirty: true })
    },

    flipStartFacing() {
      if (get().mode === 'play') return
      set((s) => ({ startFacing: s.startFacing === 0 ? 180 : 0, isDirty: true }))
    },

    selectTool(tool) {
      if (get().mode === 'play') return
      set({ selectedTool: tool, selectedPieceId: null, rejected: null })
    },

    selectPiece(id) {
      set({ selectedPieceId: id })
    },

    newDiorama() {
      const name = nextUntitledName(listDioramas().map((d) => d.name))
      loadInto({ id: null, name, setting: 'bedroom', startFacing: 0, pieces: [] })
    },

    openDiorama(id) {
      const d = getDiorama(id)
      if (!d) {
        get().showToast('That diorama could not be opened')
        return false
      }
      loadInto(d)
      return true
    },

    saveCurrent(opts = {}) {
      const s = get()
      const now = new Date().toISOString()
      const id = s.dioramaId ?? nanoid(12)
      const existing = s.dioramaId ? getDiorama(s.dioramaId) : null
      const diorama: Diorama = {
        id,
        name: existing?.name ?? s.dioramaName,
        setting: s.setting,
        startFacing: s.startFacing,
        pieces: s.pieces,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      if (opts.thumbnail) diorama.thumbnail = opts.thumbnail
      // A thumbnail is optional; drop it rather than fail when storage is tight.
      const ok = upsertDiorama(diorama) || (!!diorama.thumbnail && upsertDiorama({ ...diorama, thumbnail: undefined }))
      if (!ok) {
        get().showToast("Couldn't save: browser storage is full or blocked")
        return false
      }
      set({ dioramaId: id, dioramaName: diorama.name, isDirty: false })
      get().showToast(opts.auto ? 'Autosaved' : `Saved “${diorama.name}”`)
      return true
    },

    goToMenu() {
      stopTrain()
      set({ screen: 'menu', mode: 'build', drag: null, hoverTile: null, selectedTool: null, selectedPieceId: null })
    },

    showToast(text) {
      set((s) => ({ toast: { text, n: (s.toast?.n ?? 0) + 1 } }))
    },

    setAudio(patch) {
      const audio = { ...get().audio, ...patch }
      saveAudioSettings(audio)
      set({ audio })
    },

    resetCamera() {
      set((s) => ({ cameraResetN: s.cameraResetN + 1 }))
    },

    setLowQuality(lowQuality) {
      set({ lowQuality })
    },

    setDrag(drag) {
      set({ drag })
    },

    setHoverTile(hoverTile) {
      const prev = get().hoverTile
      if (prev?.gx === hoverTile?.gx && prev?.gz === hoverTile?.gz) return
      set({ hoverTile })
    },

    setRejected(rejected) {
      set({ rejected })
    },
  }
})

/** The §9 GameState fields only. */
export function pickGameState(s: Store): GameState {
  return {
    pieces: s.pieces,
    selectedTool: s.selectedTool,
    selectedPieceId: s.selectedPieceId,
    mode: s.mode,
    driveMode: s.driveMode,
    setting: s.setting,
    startFacing: s.startFacing,
    dioramaId: s.dioramaId,
    dioramaName: s.dioramaName,
    isDirty: s.isDirty,
  }
}
