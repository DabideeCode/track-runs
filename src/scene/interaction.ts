// Drag-and-drop controller shared by the palette (HTML) and the board (3D).
// One set of window listeners drives every drag so the source element doesn't matter.
import { playSound } from '@/audio/soundBus'
import { validatePlacement } from '@/game/rules'
import type { PieceType, Rotation, Tile } from '@/game/types'
import { useGameStore, type DragState, type Rejection } from '@/store/gameStore'
import { SHAKE_S } from './anim'
import { clientOverCanvas, clientToTile } from './pointer'

const DRAG_THRESHOLD_PX = 4
let start: { x: number; y: number } | null = null
let listening = false
/** Rotation applied to the next palette placement; R turns it while a tool is selected. */
let toolRotation: Rotation = 0
export const getToolRotation = () => toolRotation

const store = () => useGameStore.getState()

function isValid(drag: DragState, tile: Tile | null): boolean {
  if (!tile) return false
  return validatePlacement(store().pieces, { type: drag.type, gx: tile.gx, gz: tile.gz }, drag.pieceId) === null
}

function onMove(e: PointerEvent) {
  const drag = store().drag
  if (!drag) return
  const tile = clientOverCanvas(e.clientX, e.clientY) ? clientToTile(e.clientX, e.clientY) : null
  let active = drag.active
  if (!active) {
    const moved = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0
    // A palette press becomes a drag once it reaches the board; a piece press after a few pixels.
    active = drag.source === 'palette' ? tile !== null || (moved > DRAG_THRESHOLD_PX && clientOverCanvas(e.clientX, e.clientY)) : moved > DRAG_THRESHOLD_PX
    if (active) playSound('pickup')
  }
  const same = drag.tile?.gx === tile?.gx && drag.tile?.gz === tile?.gz
  if (same && active === drag.active) return
  store().setDrag({ ...drag, active, tile, valid: isValid(drag, tile) })
}

function onUp(e: PointerEvent) {
  if (e.button !== 0) return
  const drag = store().drag
  stopListening()
  if (!drag) return
  store().setDrag(null)
  if (!drag.active) return // A plain click: the tool or piece just stays selected.
  const tile = clientOverCanvas(e.clientX, e.clientY) ? clientToTile(e.clientX, e.clientY) : null
  drop(drag, tile)
}

function drop(drag: DragState, tile: Tile | null) {
  const s = store()
  if (tile) {
    const result =
      drag.source === 'palette'
        ? s.placePiece(drag.type, tile.gx, tile.gz, drag.rotation, { autoAdjust: true })
        : s.movePiece(drag.pieceId!, tile.gx, tile.gz, drag.rotation)
    if (result.ok) {
      if (drag.source === 'piece') s.selectPiece(drag.pieceId!)
      return
    }
  } else {
    playSound('invalid')
  }
  reject({
    source: drag.source,
    type: drag.type,
    pieceId: drag.pieceId,
    tile: tile ?? drag.tile,
    rotation: drag.rotation,
    at: performance.now(),
  })
}

/** Show a refused drop shaking, then clear it so it never outlives its animation. */
function reject(r: Rejection) {
  store().setRejected(r)
  window.setTimeout(() => {
    if (store().rejected === r) store().setRejected(null)
  }, SHAKE_S * 1000 + 50)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && store().drag) {
    e.stopPropagation()
    cancelDrag()
  }
}

function stopListening() {
  if (!listening) return
  listening = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', cancelDrag)
  window.removeEventListener('keydown', onKey, true)
}

function listen(e: { clientX: number; clientY: number }) {
  start = { x: e.clientX, y: e.clientY }
  if (listening) return
  listening = true
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cancelDrag)
  window.addEventListener('keydown', onKey, true)
}

export function cancelDrag() {
  stopListening()
  store().setDrag(null)
}

/** Pointer pressed on a palette item. */
export function beginPaletteDrag(type: PieceType, e: { clientX: number; clientY: number }) {
  const s = store()
  if (s.mode !== 'build') return
  s.selectTool(type)
  s.setDrag({ source: 'palette', type, rotation: toolRotation, tile: null, valid: false, active: false })
  listen(e)
}

/** Pointer pressed on a placed piece (no tool selected). */
export function beginPieceDrag(pieceId: string, e: { clientX: number; clientY: number }) {
  const s = store()
  const piece = s.pieces.find((p) => p.id === pieceId)
  if (!piece || s.mode !== 'build') return
  s.selectPiece(pieceId)
  const tile = { gx: piece.gridX, gz: piece.gridZ }
  s.setDrag({ source: 'piece', type: piece.type, pieceId, rotation: piece.rotation, tile, valid: true, active: false })
  listen(e)
}

const turn = (r: Rotation) => ((r + 90) % 360) as Rotation

/** R during a drag (or with a palette tool selected) turns the ghost (AC-6.3). Returns true if consumed. */
export function rotateDrag(): boolean {
  const s = store()
  const drag = s.drag
  if (drag) {
    s.setDrag({ ...drag, rotation: turn(drag.rotation) })
    if (drag.source === 'palette') toolRotation = turn(drag.rotation)
  } else if (s.selectedTool && s.mode === 'build') {
    toolRotation = turn(toolRotation)
  } else {
    return false
  }
  playSound('rotate')
  return true
}

/** Click on the board with a palette tool selected (AC-5.2). */
export function clickPlace(tile: Tile | null) {
  const s = store()
  if (!s.selectedTool || s.mode !== 'build') return
  if (!tile) {
    playSound('invalid')
    return
  }
  const r = s.placePiece(s.selectedTool, tile.gx, tile.gz, toolRotation, { autoAdjust: true })
  if (!r.ok) {
    reject({ source: 'palette', type: s.selectedTool, tile, rotation: toolRotation, at: performance.now() })
  }
}
