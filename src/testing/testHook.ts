import { getSoundLog } from '@/audio/soundLog';
import { getConnections } from '@/domain/connectors';
import type {
  ActionResult,
  GameState,
  PieceType,
  PlaceResult,
  Rotation,
  TrainSnapshot,
} from '@/domain/types';
import {
  movePiece,
  placePiece,
  removePiece,
  rotatePiece,
  setDriveMode,
  setMode,
} from '@/store/commands';
import { useGameStore } from '@/store/gameStore';
import { getTrainSnapshot } from '@/train/runtime';

export interface DioramaTestHook {
  getState(): GameState;
  placePiece(type: PieceType, gridX: number, gridZ: number, rotation?: Rotation): PlaceResult;
  movePiece(id: string, gridX: number, gridZ: number): ActionResult;
  rotatePiece(id: string): ActionResult;
  removePiece(id: string): ActionResult;
  getConnections(): Array<[string, string]>;
  setMode(mode: 'build' | 'play'): ActionResult;
  setDriveMode(mode: 'auto' | 'manual'): void;
  getTrain(): TrainSnapshot | null;
  getSoundLog(): string[];
}

function readGameState(): GameState {
  const state = useGameStore.getState();
  return {
    pieces: state.pieces,
    selectedTool: state.selectedTool,
    selectedPieceId: state.selectedPieceId,
    mode: state.mode,
    driveMode: state.driveMode,
    setting: state.setting,
    startFacing: state.startFacing,
    dioramaId: state.dioramaId,
    dioramaName: state.dioramaName,
    isDirty: state.isDirty,
  };
}

const hook: DioramaTestHook = {
  getState: readGameState,
  placePiece,
  movePiece,
  rotatePiece,
  removePiece,
  getConnections: () => getConnections(useGameStore.getState().pieces),
  setMode,
  setDriveMode,
  getTrain: () => getTrainSnapshot(useGameStore.getState()),
  getSoundLog,
};

declare global {
  interface Window {
    __DIORAMA__?: DioramaTestHook;
  }
}

export function installTestHook(): void {
  const enabled =
    import.meta.env.DEV || new URLSearchParams(window.location.search).get('test') === '1';
  if (enabled) window.__DIORAMA__ = hook;
}
