import { getSoundLog } from '@/audio/soundBus'
import { getConnections } from '@/game/connections'
import { getTrainInfo } from '@/game/trainRuntime'
import type { TrainInfo } from '@/game/train'
import type { ActionResult, GameState, PieceType, Rotation } from '@/game/types'
import { pickGameState, useGameStore } from '@/store/gameStore'

export interface DioramaTestHook {
  getState(): GameState
  placePiece(type: PieceType, gridX: number, gridZ: number, rotation?: Rotation): ActionResult
  movePiece(id: string, gridX: number, gridZ: number): ActionResult
  rotatePiece(id: string): ActionResult
  removePiece(id: string): ActionResult
  getConnections(): Array<[string, string]>
  setMode(mode: 'build' | 'play'): ActionResult
  setDriveMode(mode: 'auto' | 'manual'): void
  getTrain(): TrainInfo | null
  getSoundLog(): string[]
}

declare global {
  interface Window {
    __DIORAMA__?: DioramaTestHook
  }
}

export function testHookEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(window.location.search).get('test') === '1'
}

/** Expose window.__DIORAMA__ (§10.2) in development or when the URL has ?test=1. */
export function installTestHook() {
  if (!testHookEnabled()) return
  const store = () => useGameStore.getState()
  window.__DIORAMA__ = {
    getState: () => structuredClone(pickGameState(store())),
    placePiece: (type, gridX, gridZ, rotation) => store().placePiece(type, gridX, gridZ, rotation),
    movePiece: (id, gridX, gridZ) => store().movePiece(id, gridX, gridZ),
    rotatePiece: (id) => store().rotatePiece(id),
    removePiece: (id) => store().removePiece(id),
    getConnections: () => getConnections(store().pieces),
    setMode: (mode) => store().setMode(mode),
    setDriveMode: (mode) => store().setDriveMode(mode),
    getTrain: () => {
      const s = store()
      return getTrainInfo(s.mode, s.pieces, s.startFacing)
    },
    getSoundLog,
  }
}
