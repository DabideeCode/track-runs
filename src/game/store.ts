import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { playSound } from '@/audio/log'
import { isPieceType } from './catalog'
import { nextRotation } from './grid'
import {
  deleteDiorama,
  loadAudioSettings,
  loadDioramas,
  loadLowQuality,
  renameDiorama,
  saveAudioSettings,
  saveLowQuality,
  writeDiorama,
  type AudioSettings,
} from './persistence'
import { autoRotate, findConnections, validate } from './rules'
import { trainRuntime } from './trainRuntime'
import type {
  ActionResult,
  DriveMode,
  GameState,
  Mode,
  Piece,
  PieceType,
  Reason,
  Rotation,
  Setting,
} from './types'

const HISTORY_LIMIT = 50
const NEW_NAME = 'Untitled diorama'

export interface Tile {
  gridX: number
  gridZ: number
}

export interface WorldPoint {
  x: number
  z: number
}

export interface DragState {
  source: 'palette' | 'board'
  type: PieceType
  pieceId: string | null
  rotation: Rotation
  /** Pointer position on the ground, null while off the canvas. */
  world: WorldPoint | null
  /** Anchor tile the piece would land on, null off the grid. */
  tile: Tile | null
  valid: boolean
  /** Tile offset from the anchor to where the piece was grabbed. */
  grabDX: number
  grabDZ: number
  previousTool: PieceType | null
}

/** A drag that ended without a placement, played out by the ghost. */
export interface DropEffect {
  key: number
  shake: boolean
  type: PieceType
  rotation: Rotation
  pieceId: string | null
}

interface Toast {
  id: number
  message: string
}

interface Store extends GameState {
  screen: 'menu' | 'playfield'
  createdAt: string | null
  drag: DragState | null
  dropEffect: DropEffect | null
  hoverTile: Tile | null
  hoverPieceId: string | null
  /** Rotation of the hover ghost while a palette tool is active. */
  toolRotation: Rotation
  /** The last pieces change should appear at once (undo, redo). */
  instantEdit: boolean
  past: Piece[][]
  future: Piece[][]
  toast: Toast | null
  lowQuality: boolean
  audio: AudioSettings
  previews: Partial<Record<PieceType, string>>
  /** Bumped to tell the menu to reread storage. */
  menuRevision: number

  newDiorama(): void
  openDiorama(id: string): void
  goToMenu(): void
  removeSaved(id: string): void
  renameSaved(id: string, name: string): void

  place(
    type: PieceType,
    gridX: number,
    gridZ: number,
    rotation?: Rotation,
    options?: { adjust?: boolean; select?: boolean },
  ): ActionResult
  move(id: string, gridX: number, gridZ: number, rotation?: Rotation): ActionResult
  rotate(id: string): ActionResult
  remove(id: string): ActionResult

  selectTool(tool: PieceType | null): void
  selectPiece(id: string | null): void
  clickTile(gridX: number, gridZ: number): void
  setHover(tile: Tile | null, pieceId: string | null): void
  rotateSelection(): void
  deleteSelection(): void
  escape(): void

  dragFromPalette(type: PieceType): void
  dragFromBoard(id: string, grabDX: number, grabDZ: number): void
  dragUpdate(world: WorldPoint | null, tile: Tile | null): void
  dragEnd(): void
  dragCancel(): void
  finishDropEffect(): void

  undo(): void
  redo(): void

  setMode(mode: Mode): ActionResult
  setDriveMode(mode: DriveMode): void
  toggleMode(): void
  toggleDriveMode(): void
  setSetting(setting: Setting): void
  flipDirection(): void
  setLowQuality(low: boolean): void
  setAudio(patch: Partial<AudioSettings>): void
  setPreviews(previews: Partial<Record<PieceType, string>>): void

  save(options?: { auto?: boolean }): boolean
  showToast(message: string): void
  clearToast(): void
}

export const uniqueName = (taken: string[]) => {
  if (!taken.includes(NEW_NAME)) return NEW_NAME
  for (let n = 2; ; n++) {
    const name = `${NEW_NAME} ${n}`
    if (!taken.includes(name)) return name
  }
}

/** Includes tiles, so meeting the same neighbour on a different side counts as a new connection. */
const connectionKeys = (pieces: Piece[]) => {
  const byId = new Map(pieces.map((piece) => [piece.id, piece]))
  const end = (id: string) => `${id}@${byId.get(id)!.gridX},${byId.get(id)!.gridZ}`
  return new Set(findConnections(pieces).map(([a, b]) => [end(a), end(b)].sort().join('|')))
}

const madeConnection = (before: Piece[], after: Piece[]) => {
  const old = connectionKeys(before)
  return [...connectionKeys(after)].some((key) => !old.has(key))
}

const normaliseRotation = (rotation: number): Rotation =>
  ((((Math.round(rotation / 90) * 90) % 360) + 360) % 360) as Rotation

let thumbnailProvider: (() => string | undefined) | null = null
export const setThumbnailProvider = (provider: typeof thumbnailProvider) => {
  thumbnailProvider = provider
}

const blankDiorama = (name: string) => ({
  pieces: [] as Piece[],
  selectedTool: null,
  selectedPieceId: null,
  mode: 'build' as const,
  driveMode: 'auto' as const,
  setting: 'bedroom' as const,
  startFacing: 0 as const,
  dioramaId: null,
  dioramaName: name,
  isDirty: false,
  createdAt: null,
  drag: null,
  dropEffect: null,
  hoverTile: null,
  hoverPieceId: null,
  toolRotation: 0 as const,
  instantEdit: false,
  past: [],
  future: [],
})

let toastId = 0
let dropEffectKey = 0

export const useGame = create<Store>()((set, get) => {
  const reject = (reason: Reason): ActionResult => {
    if (reason !== 'not_found') playSound('invalid')
    return { ok: false, reason }
  }

  /** Applies a change to the pieces as one undoable edit. */
  const commit = (pieces: Piece[], extra: Partial<Store> = {}) =>
    set((state) => ({
      pieces,
      past: [...state.past, state.pieces].slice(-HISTORY_LIMIT),
      future: [],
      isDirty: true,
      instantEdit: false,
      ...extra,
    }))

  const snapIfConnected = (before: Piece[]) => {
    if (madeConnection(before, get().pieces)) playSound('snap')
  }

  const restore = (from: Piece[][], to: Piece[][], pieces: Piece[]) => {
    const selected = get().selectedPieceId
    return {
      pieces,
      instantEdit: true,
      isDirty: true,
      selectedPieceId: pieces.some((piece) => piece.id === selected) ? selected : null,
      past: to,
      future: from,
    }
  }

  const clearDragEffect = (drag: DragState, shake: boolean) => ({
    drag: null,
    selectedTool: drag.previousTool,
    dropEffect: {
      key: ++dropEffectKey,
      shake,
      type: drag.type,
      rotation: drag.rotation,
      pieceId: drag.pieceId,
    },
  })

  return {
    ...blankDiorama(NEW_NAME),
    screen: 'menu',
    toast: null,
    lowQuality: loadLowQuality(),
    audio: loadAudioSettings(),
    previews: {},
    menuRevision: 0,

    newDiorama() {
      trainRuntime.stop()
      const name = uniqueName(loadDioramas().map((diorama) => diorama.name))
      set({ ...blankDiorama(name), screen: 'playfield' })
    },

    openDiorama(id) {
      const diorama = loadDioramas().find((entry) => entry.id === id)
      if (!diorama) {
        get().showToast('That diorama could not be opened')
        return
      }
      trainRuntime.stop()
      set({
        ...blankDiorama(diorama.name),
        pieces: diorama.pieces,
        setting: diorama.setting,
        startFacing: diorama.startFacing,
        dioramaId: diorama.id,
        createdAt: diorama.createdAt,
        screen: 'playfield',
      })
    },

    goToMenu() {
      trainRuntime.stop()
      set((state) => ({
        ...blankDiorama(NEW_NAME),
        screen: 'menu',
        menuRevision: state.menuRevision + 1,
      }))
    },

    removeSaved(id) {
      if (!deleteDiorama(id)) get().showToast('Could not delete that diorama')
      set((state) => ({ menuRevision: state.menuRevision + 1 }))
    },

    renameSaved(id, name) {
      if (!renameDiorama(id, name.trim())) get().showToast('Could not rename that diorama')
      set((state) => ({ menuRevision: state.menuRevision + 1 }))
    },

    place(type, gridX, gridZ, rotation, options = {}) {
      const state = get()
      if (state.mode === 'play') return reject('play_mode')
      if (!isPieceType(type)) return reject('not_found')
      const reason = validate(state.pieces, { type, gridX, gridZ })
      if (reason) return reject(reason)

      const adjust = options.adjust ?? rotation === undefined
      const base = normaliseRotation(rotation ?? 0)
      const piece: Piece = {
        id: nanoid(10),
        type,
        gridX,
        gridZ,
        rotation: adjust ? autoRotate(state.pieces, { type, gridX, gridZ, rotation: base }) : base,
      }
      commit([...state.pieces, piece], {
        ...(options.select ? { selectedPieceId: piece.id } : {}),
        // There can only be one, so the tool has nothing left to place.
        ...(type === 'station' && get().selectedTool === 'station' ? { selectedTool: null } : {}),
      })
      playSound('place')
      snapIfConnected(state.pieces)
      return { ok: true, id: piece.id }
    },

    move(id, gridX, gridZ, rotation) {
      const state = get()
      if (state.mode === 'play') return reject('play_mode')
      const piece = state.pieces.find((entry) => entry.id === id)
      if (!piece) return reject('not_found')
      const reason = validate(state.pieces, { type: piece.type, gridX, gridZ }, id)
      if (reason) return reject(reason)

      const others = state.pieces.filter((entry) => entry.id !== id)
      const dropped = { type: piece.type, gridX, gridZ, rotation: rotation ?? piece.rotation }
      const settled = autoRotate(others, dropped)
      const unchanged =
        piece.gridX === gridX && piece.gridZ === gridZ && piece.rotation === settled
      if (!unchanged) {
        commit(
          state.pieces.map((entry) =>
            entry.id === id ? { ...entry, gridX, gridZ, rotation: settled } : entry,
          ),
        )
      }
      playSound('move')
      snapIfConnected(state.pieces)
      return { ok: true }
    },

    rotate(id) {
      const state = get()
      if (state.mode === 'play') return reject('play_mode')
      if (!state.pieces.some((entry) => entry.id === id)) return reject('not_found')
      commit(
        state.pieces.map((entry) =>
          entry.id === id ? { ...entry, rotation: nextRotation(entry.rotation) } : entry,
        ),
      )
      playSound('rotate')
      snapIfConnected(state.pieces)
      return { ok: true }
    },

    remove(id) {
      const state = get()
      if (state.mode === 'play') return reject('play_mode')
      if (!state.pieces.some((entry) => entry.id === id)) return reject('not_found')
      commit(
        state.pieces.filter((entry) => entry.id !== id),
        {
          selectedPieceId: state.selectedPieceId === id ? null : state.selectedPieceId,
          hoverPieceId: state.hoverPieceId === id ? null : state.hoverPieceId,
        },
      )
      playSound('delete')
      return { ok: true }
    },

    selectTool(tool) {
      const state = get()
      if (state.mode === 'play') return
      const stationTaken =
        tool === 'station' && state.pieces.some((piece) => piece.type === 'station')
      set({
        selectedTool: stationTaken ? null : tool,
        selectedPieceId: null,
        toolRotation: 0,
      })
    },

    selectPiece(id) {
      set({ selectedPieceId: id, selectedTool: null })
    },

    clickTile(gridX, gridZ) {
      const { selectedTool, toolRotation } = get()
      if (!selectedTool) return
      get().place(selectedTool, gridX, gridZ, toolRotation, { adjust: true })
    },

    setHover(tile, pieceId) {
      const state = get()
      const sameTile =
        state.hoverTile?.gridX === tile?.gridX && state.hoverTile?.gridZ === tile?.gridZ
      if (sameTile && state.hoverPieceId === pieceId) return
      set({ hoverTile: tile, hoverPieceId: pieceId })
    },

    rotateSelection() {
      const state = get()
      if (state.mode === 'play') return
      if (state.drag) {
        const rotation = nextRotation(state.drag.rotation)
        set({ drag: { ...state.drag, rotation } })
        playSound('rotate')
      } else if (state.selectedTool) {
        set({ toolRotation: nextRotation(state.toolRotation) })
        playSound('rotate')
      } else if (state.selectedPieceId) {
        state.rotate(state.selectedPieceId)
      }
    },

    deleteSelection() {
      const { selectedPieceId, mode, drag, remove } = get()
      if (selectedPieceId && mode === 'build' && !drag) remove(selectedPieceId)
    },

    escape() {
      const state = get()
      if (state.drag) state.dragCancel()
      else if (state.selectedTool) set({ selectedTool: null })
      else if (state.selectedPieceId) set({ selectedPieceId: null })
    },

    dragFromPalette(type) {
      const state = get()
      if (state.mode === 'play' || state.drag) return
      if (type === 'station' && state.pieces.some((piece) => piece.type === 'station')) return
      set({
        drag: {
          source: 'palette',
          type,
          pieceId: null,
          rotation: 0,
          world: null,
          tile: null,
          valid: false,
          grabDX: 0,
          grabDZ: 0,
          previousTool: state.selectedTool,
        },
        selectedTool: type,
        selectedPieceId: null,
        dropEffect: null,
      })
      playSound('pickup')
    },

    dragFromBoard(id, grabDX, grabDZ) {
      const state = get()
      if (state.mode === 'play' || state.drag) return
      const piece = state.pieces.find((entry) => entry.id === id)
      if (!piece) return
      set({
        drag: {
          source: 'board',
          type: piece.type,
          pieceId: id,
          rotation: piece.rotation,
          world: null,
          tile: { gridX: piece.gridX, gridZ: piece.gridZ },
          valid: true,
          grabDX,
          grabDZ,
          previousTool: null,
        },
        selectedPieceId: id,
        selectedTool: null,
        dropEffect: null,
      })
      playSound('pickup')
    },

    dragUpdate(world, tile) {
      const state = get()
      if (!state.drag) return
      const { drag } = state
      const anchor = tile && {
        gridX: tile.gridX - drag.grabDX,
        gridZ: tile.gridZ - drag.grabDZ,
      }
      const valid =
        !!anchor && validate(state.pieces, { type: drag.type, ...anchor }, drag.pieceId ?? undefined) === null
      set({ drag: { ...drag, world, tile: anchor, valid } })
    },

    dragEnd() {
      const state = get()
      const { drag } = state
      if (!drag) return
      if (!drag.tile || !drag.valid) {
        playSound('invalid')
        set(clearDragEffect(drag, true))
        return
      }
      const { gridX, gridZ } = drag.tile
      set({ drag: null, selectedTool: drag.previousTool })
      if (drag.pieceId) {
        state.move(drag.pieceId, gridX, gridZ, drag.rotation)
      } else {
        state.place(drag.type, gridX, gridZ, drag.rotation, {
          adjust: true,
          select: drag.previousTool === null,
        })
      }
    },

    dragCancel() {
      const { drag } = get()
      if (drag) set(clearDragEffect(drag, false))
    },

    finishDropEffect() {
      set({ dropEffect: null })
    },

    undo() {
      const { past, future, pieces, mode, drag } = get()
      if (mode === 'play' || drag || past.length === 0) return
      set(restore([pieces, ...future], past.slice(0, -1), past[past.length - 1]))
    },

    redo() {
      const { past, future, pieces, mode, drag } = get()
      if (mode === 'play' || drag || future.length === 0) return
      set(restore(future.slice(1), [...past, pieces], future[0]))
    },

    setMode(mode) {
      const state = get()
      if (state.mode === mode) return { ok: true }
      if (mode === 'build') {
        trainRuntime.stop()
        set({ mode, driveMode: 'auto' })
        return { ok: true }
      }
      if (!state.pieces.some((piece) => piece.type === 'station')) {
        state.showToast('Place a station to start')
        return { ok: false, reason: 'no_station' }
      }
      if (state.drag) state.dragCancel()
      set({
        mode,
        driveMode: 'auto',
        selectedTool: null,
        selectedPieceId: null,
        hoverTile: null,
        hoverPieceId: null,
      })
      trainRuntime.start(state.pieces, state.startFacing, () => get().driveMode)
      playSound('whistle')
      return { ok: true }
    },

    setDriveMode(driveMode) {
      set({ driveMode })
    },

    toggleMode() {
      const { mode, setMode } = get()
      setMode(mode === 'build' ? 'play' : 'build')
    },

    toggleDriveMode() {
      const { driveMode, mode } = get()
      if (mode === 'play') set({ driveMode: driveMode === 'auto' ? 'manual' : 'auto' })
    },

    setSetting(setting) {
      if (get().setting !== setting) set({ setting, isDirty: true })
    },

    flipDirection() {
      const { mode, startFacing } = get()
      if (mode === 'build') set({ startFacing: startFacing === 0 ? 180 : 0, isDirty: true })
    },

    setLowQuality(lowQuality) {
      set({ lowQuality })
      saveLowQuality(lowQuality)
    },

    setAudio(patch) {
      const audio = { ...get().audio, ...patch }
      set({ audio })
      saveAudioSettings(audio)
    },

    setPreviews(previews) {
      set({ previews })
    },

    save({ auto = false } = {}) {
      const state = get()
      const now = new Date().toISOString()
      const id = state.dioramaId ?? nanoid(12)
      const createdAt = state.createdAt ?? now
      const diorama = {
        id,
        name: state.dioramaName,
        setting: state.setting,
        startFacing: state.startFacing,
        pieces: state.pieces,
        createdAt,
        updatedAt: now,
      }
      const thumbnail = thumbnailProvider?.()
      const written =
        (thumbnail !== undefined && writeDiorama({ ...diorama, thumbnail })) ||
        writeDiorama(diorama)
      if (!written) {
        state.showToast('Could not save: browser storage is full or unavailable')
        return false
      }
      set({ dioramaId: id, createdAt, isDirty: false })
      state.showToast(auto ? 'Autosaved' : `Saved “${state.dioramaName}”`)
      return true
    },

    showToast(message) {
      set({ toast: { id: ++toastId, message } })
    },

    clearToast() {
      set({ toast: null })
    },
  }
})
