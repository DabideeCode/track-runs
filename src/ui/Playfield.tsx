/**
 * The playfield screen (task 15.6; design sections 9.2, 9.3, 10.1, 10.2,
 * D-58; Requirements 2.1, 2.5, 2.6, 30.8, 37.7).
 *
 * - `data-testid="playfield"` carries `data-mode` = the store's `mode`.
 * - `SceneCanvas` fills the viewport. Over it sits the overlay root, which is
 *   `pointer-events: none`, so canvas input passes through everywhere except
 *   over a panel; every panel uses the `panel` utility, which sets
 *   `pointer-events: auto`. The drag controller relies on this: an event is
 *   "over the scene" exactly when its target is the canvas.
 * - One `DragController` per playfield, attached to `window` while mounted.
 *   The palette gets it for `paletteDown`, the scene for `setPickPiece`.
 * - The keyboard shortcuts are mounted while the playfield is shown.
 * - The overlay has its own error boundary, so a broken panel leaves the 3D
 *   view running and shows a notice with a way back to the menu. The canvas
 *   has its own boundary inside `SceneCanvas`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDragController, type DragController, type PointerLike } from '@/input/DragController';
import { useDragController } from '@/input/useDragController';
import { useKeyboardShortcuts } from '@/input/useKeyboardShortcuts';
import { SceneCanvas } from '@/scene/SceneCanvas';
import { useSceneBridge, useTrainRuntime } from '@/scene/context';
import { useAppStore, useAppStoreApi } from '@/store/useAppStore';
import { ActionBar } from '@/ui/ActionBar';
import { ErrorBoundary, RecoveryNotice } from '@/ui/ErrorBoundary';
import { Palette } from '@/ui/Palette';
import { TopBar } from '@/ui/TopBar';
import { ViewPanel } from '@/ui/ViewPanel';

export const OVERLAY_ERROR_DETAIL = 'The controls could not be shown. Your diorama is still here.';

export function Playfield() {
  const store = useAppStoreApi();
  const bridge = useSceneBridge();
  const train = useTrainRuntime();
  const mode = useAppStore((s) => s.mode);

  // The WebGL canvas, read by `isOverScene` at event time.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCanvasReady = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  // Created once per playfield; constructing it has no side effects, so the
  // lazy initialiser running twice under StrictMode is harmless.
  const [controller] = useState<DragController>(() =>
    createDragController({
      store,
      bridge,
      isOverScene: (e: PointerLike) => canvasRef.current !== null && e.target === canvasRef.current,
      playUi: () => store.getState().playUi(),
    }),
  );
  useDragController(controller);
  useKeyboardShortcuts(train);

  // The scene's pick proxies register on the controller; clear the picker
  // when the playfield goes away so a stale scene is never consulted.
  useEffect(() => () => controller.setPickPiece(null), [controller]);

  return (
    <div data-testid="playfield" data-mode={mode} className="fixed inset-0 overflow-hidden bg-background">
      <SceneCanvas controller={controller} onCanvasReady={onCanvasReady} />
      <div data-overlay-root="" className="pointer-events-none fixed inset-0 select-none">
        <ErrorBoundary
          name="playfield controls"
          fallback={(reset) => (
            <div className="fixed inset-0 flex items-center justify-center p-4">
              <RecoveryNotice
                detail={OVERLAY_ERROR_DETAIL}
                onTryAgain={() => {
                  store.getState().playUi();
                  reset();
                }}
                onBackToMenu={() => {
                  store.getState().playUi();
                  store.getState().backToMenu();
                }}
              />
            </div>
          )}
        >
          <TopBar />
          {/* Left, vertically centred. The height cap keeps it clear of the
              top bar (about 85 px including its margin) on both ends of the
              centred box, so the Back button is never covered on short
              viewports; the palette scrolls instead. */}
          <Palette
            controller={controller}
            className="fixed top-1/2 left-3 max-h-[calc(100vh-11rem)] -translate-y-1/2"
          />
          <ActionBar />
          <ViewPanel />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default Playfield;
