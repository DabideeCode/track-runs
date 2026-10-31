import { useEffect } from 'react'
import { worldToTile } from '@/game/grid'
import { useGame } from '@/game/store'
import { trainRuntime } from '@/game/trainRuntime'
import type { Piece, PieceType } from '@/game/types'
import { boardCanvas, groundPoint, isOverCanvas, pickPiece } from '@/scene/boardPicking'

const DRAG_THRESHOLD = 5

type Press = { x: number; y: number } & (
  | { kind: 'palette'; type: PieceType }
  | { kind: 'piece'; piece: Piece; grabX: number; grabZ: number }
  | { kind: 'tile' }
  | { kind: 'empty' }
)

let press: Press | null = null
let suppressClick = false

/** Called by a palette item on pointer down, so a drag can start from it. */
export const pressPaletteItem = (type: PieceType, x: number, y: number) => {
  press = { kind: 'palette', type, x, y }
  suppressClick = false
}

/** True once when the click that follows a palette drag should be ignored. */
export const consumePaletteClick = () => {
  const suppressed = suppressClick
  suppressClick = false
  return suppressed
}

/** Tile under the pointer without the bounds check, so an offset grab can reach the grid edge. */
const rawTile = (clientX: number, clientY: number) => {
  const point = groundPoint(clientX, clientY)
  if (!point) return null
  return { gridX: Math.floor(point.x + 8), gridZ: Math.floor(point.z + 8) }
}

const onGridTile = (clientX: number, clientY: number) => {
  const point = groundPoint(clientX, clientY)
  return point ? worldToTile(point.x, point.z) : null
}

const updateDrag = (event: PointerEvent) => {
  const game = useGame.getState()
  if (isOverCanvas(event.clientX, event.clientY)) {
    game.dragUpdate(groundPoint(event.clientX, event.clientY), rawTile(event.clientX, event.clientY))
  } else {
    game.dragUpdate(null, null)
  }
}

const updateCursor = () => {
  const canvas = boardCanvas()
  if (!canvas) return
  const { drag, selectedTool, hoverPieceId, mode } = useGame.getState()
  let cursor = 'default'
  if (mode === 'build') {
    if (drag) cursor = 'grabbing'
    else if (selectedTool) cursor = 'copy'
    else if (hoverPieceId) cursor = 'pointer'
  }
  canvas.style.cursor = cursor
}

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0 || event.target !== boardCanvas()) return
  const game = useGame.getState()
  if (game.mode === 'play') return
  const { clientX: x, clientY: y } = event
  if (game.selectedTool) {
    press = { kind: 'tile', x, y }
    return
  }
  const piece = pickPiece(game.pieces, x, y)
  if (!piece) {
    press = { kind: 'empty', x, y }
    return
  }
  const tile = rawTile(x, y) ?? { gridX: piece.gridX, gridZ: piece.gridZ }
  press = { kind: 'piece', piece, grabX: tile.gridX - piece.gridX, grabZ: tile.gridZ - piece.gridZ, x, y }
}

const onPointerMove = (event: PointerEvent) => {
  const game = useGame.getState()
  if (press && !game.drag) {
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (moved >= DRAG_THRESHOLD) {
      if (press.kind === 'palette') {
        game.dragFromPalette(press.type)
        suppressClick = true
        press = null
      } else if (press.kind === 'piece') {
        game.dragFromBoard(press.piece.id, press.grabX, press.grabZ)
        press = null
      }
    }
  }

  if (useGame.getState().drag) {
    updateDrag(event)
  } else if (event.buttons === 0 && game.mode === 'build') {
    if (isOverCanvas(event.clientX, event.clientY)) {
      const piece = game.selectedTool ? null : pickPiece(game.pieces, event.clientX, event.clientY)
      game.setHover(onGridTile(event.clientX, event.clientY), piece?.id ?? null)
    } else {
      game.setHover(null, null)
    }
  }
  updateCursor()
}

const onPointerUp = (event: PointerEvent) => {
  if (event.button !== 0) return
  const game = useGame.getState()
  if (game.drag) {
    updateDrag(event)
    useGame.getState().dragEnd()
  } else if (press) {
    const { clientX: x, clientY: y } = event
    if (press.kind === 'tile' && isOverCanvas(x, y)) {
      const tile = onGridTile(x, y)
      if (tile) game.clickTile(tile.gridX, tile.gridZ)
    } else if (press.kind === 'piece') {
      game.selectPiece(press.piece.id)
    } else if (press.kind === 'empty') {
      game.selectPiece(null)
    }
  }
  press = null
  updateCursor()
}

const cancel = () => {
  press = null
  useGame.getState().dragCancel()
  trainRuntime.clearKeys()
}

/** All left-button board input: palette drags, piece drags, clicks and hover. */
export const useBoardInput = () => {
  useEffect(() => {
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      press = null
    }
  }, [])
}
