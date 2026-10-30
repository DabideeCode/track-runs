/**
 * React contexts that hand the app's single `SceneBridge` and `TrainRuntime`
 * to the 3D scene. R3F 9 forwards React contexts from outside `<Canvas>` into
 * the scene tree, so the providers can sit around the canvas in the playfield.
 * The bootstrap (task 11.4) creates one instance of each and provides them.
 */
import { createContext, useContext } from 'react';
import type { SceneBridge } from '@/runtime/SceneBridge';
import type { TrainRuntime } from '@/runtime/TrainRuntime';

export const SceneBridgeContext = createContext<SceneBridge | null>(null);

/** The scene bridge from the nearest provider. Throws when there is none. */
export function useSceneBridge(): SceneBridge {
  const bridge = useContext(SceneBridgeContext);
  if (!bridge) throw new Error('useSceneBridge must be used inside a SceneBridgeContext provider');
  return bridge;
}

/**
 * The app's single train runtime: the same instance the store (as its
 * `TrainPort`), the keyboard and the test hook use. Read by `TrainView`
 * every frame.
 */
export const TrainRuntimeContext = createContext<TrainRuntime | null>(null);

/** The train runtime from the nearest provider. Throws when there is none. */
export function useTrainRuntime(): TrainRuntime {
  const runtime = useContext(TrainRuntimeContext);
  if (!runtime) throw new Error('useTrainRuntime must be used inside a TrainRuntimeContext provider');
  return runtime;
}
