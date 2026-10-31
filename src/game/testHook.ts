import { getSoundLog } from '@/audio/log'
import { findConnections } from './rules'
import { useGame } from './store'
import { trainRuntime } from './trainRuntime'
import type { ActionResult, DriveMode, GameState, Mode, PieceType, Rotation, TrainReport } from './types'

export interface DioramaTestHook {
  getState(): GameState
  placePiece(type: PieceType, gridX: number, gridZ: number, rotation?: Rotation): ActionResult
  movePiece(id: string, gridX: number, gridZ: number): ActionResult
  rotatePiece(id: string): ActionResult
  removePiece(id: string): ActionResult
  getConnections(): Array<[string, string]>
  setMode(mode: Mode): ActionResult
  setDriveMode(mode: DriveMode): void
  getTrain(): TrainReport | null
  getSoundLog(): string[]
}

declare global {
  interface Window {
    __DIORAMA__?: DioramaTestHook
  }
}

const game = () => useGame.getState()

export const createTestHook = (): DioramaTestHook => ({
  getState() {
    const state = game()
    return {
      pieces: state.pieces.map((piece) => ({ ...piece })),
      selectedTool: state.selectedTool,
      selectedPieceId: state.selectedPieceId,
      mode: state.mode,
      driveMode: state.driveMode,
      setting: state.setting,
      startFacing: state.startFacing,
      dioramaId: state.dioramaId,
      dioramaName: state.dioramaName,
      isDirty: state.isDirty,
    }
  },
  placePiece: (type, gridX, gridZ, rotation) => game().place(type, gridX, gridZ, rotation),
  movePiece: (id, gridX, gridZ) => game().move(id, gridX, gridZ),
  rotatePiece: (id) => game().rotate(id),
  removePiece: (id) => game().remove(id),
  getConnections: () => findConnections(game().pieces),
  setMode: (mode) => game().setMode(mode),
  setDriveMode: (mode) => game().setDriveMode(mode),
  getTrain: () => trainRuntime.report(game().pieces, game().startFacing),
  getSoundLog,
})

export const installTestHook = () => {
  const requested = new URLSearchParams(window.location.search).get('test') === '1'
  if (requested || import.meta.env.DEV) window.__DIORAMA__ = createTestHook()
}
