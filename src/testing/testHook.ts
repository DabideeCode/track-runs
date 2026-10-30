import { getSoundLog, type SoundEvent } from '@/audio/audioEngine';
import { getConnections } from '@/domain/connections';
import type {
  ActionResult,
  DriveMode,
  GameState,
  Mode,
  PieceType,
  PlaceResult,
  Rotation,
} from '@/domain/types';
import { projectToScreen } from '@/interaction/pointerRay';
import { useGameStore } from '@/store/gameStore';
import { readRunningTrain, type TrainInfo } from '@/store/trainRuntime';

export interface DioramaTestHook {
  getState(): GameState;
  placePiece(type: PieceType, gridX: number, gridZ: number, rotation?: Rotation): PlaceResult;
  movePiece(id: string, gridX: number, gridZ: number): ActionResult;
  rotatePiece(id: string): ActionResult;
  removePiece(id: string): ActionResult;
  getConnections(): Array<[string, string]>;
  setMode(mode: Mode): ActionResult;
  setDriveMode(mode: DriveMode): void;
  getTrain(): TrainInfo | null;
  getSoundLog(): SoundEvent[];
}

declare global {
  interface Window {
    __DIORAMA__?: DioramaTestHook;
  }
}

function snapshot(): GameState {
  const state = useGameStore.getState();
  return structuredClone({
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
  });
}

function getTrain(): TrainInfo | null {
  const running = readRunningTrain();
  if (running) return running;
  const station = useGameStore.getState().pieces.find((piece) => piece.type === 'station');
  if (!station) return null;
  return { pieceId: station.id, progress: 0.5, moving: false, direction: 'forward', speed: 0 };
}

export function installTestHook() {
  const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('test') === '1';
  if (!enabled) return;

  const store = () => useGameStore.getState();
  window.__DIORAMA__ = {
    getState: snapshot,
    placePiece: (type, gridX, gridZ, rotation) => store().placePiece(type, gridX, gridZ, rotation),
    movePiece: (id, gridX, gridZ) => store().movePiece(id, gridX, gridZ),
    rotatePiece: (id) => store().rotatePiece(id),
    removePiece: (id) => store().removePiece(id),
    getConnections: () => getConnections(store().pieces),
    setMode: (mode) => store().setMode(mode),
    setDriveMode: (mode) => store().setDriveMode(mode),
    getTrain,
    getSoundLog,
  };
  (window as unknown as { __TRACK_PROJECT__: typeof projectToScreen }).__TRACK_PROJECT__ = projectToScreen;
}
