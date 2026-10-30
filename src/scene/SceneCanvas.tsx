/**
 * Full-viewport WebGL canvas of the playfield (task 14.14; design sections
 * 7.1 and Error Handling, D-35, D-57; Requirements 2.1, 2.6, 2.8, 9.10, 32.2,
 * 32.3, 33.2, 33.3).
 *
 * - A fixed container covers the viewport; R3F's resize observer keeps the
 *   canvas at the container size and updates the camera aspect on resize
 *   (Requirements 2.1, 2.8).
 * - The pixel ratio is `dprFor(devicePixelRatio, lowQuality)`. It is
 *   recomputed when the window is resized, when the device pixel ratio changes
 *   (browser zoom, another monitor) and when Low quality changes, without
 *   recreating the canvas, so the camera pose survives (Requirement 33.3).
 * - Shadows use `PCFShadowMap` and are switched off in Low quality (D-57).
 * - The browser context menu is suppressed over the canvas (Requirement 9.10).
 * - The renderer, camera, scene and camera controls are registered with the
 *   `SceneBridge` by `CameraRig` inside `Scene`, so registration happens once
 *   and is undone when the scene unmounts (D-57).
 * - A render error or a lost WebGL context replaces the canvas with
 *   "The 3D view stopped. Reload to continue." and a Reload button. The store
 *   is untouched, so the diorama can still be saved (without a thumbnail).
 */
import { Component, useEffect, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/ui/components/ui/button';
import { Scene } from './Scene';
import type { PickTarget } from './pieces/PickProxies';
import {
  SCENE_FAILURE_MESSAGE,
  SCENE_RELOAD_LABEL,
  canvasConfig,
  type CanvasConfig,
  type SceneFailure,
} from './sceneCanvasConfig';

export interface SceneCanvasProps {
  /** The playfield's drag controller, passed to `Scene` for piece picking (D-47). */
  controller?: PickTarget | null;
  /**
   * Receives the WebGL canvas element once the renderer exists, and null when
   * it goes away. The playfield uses it for `isOverScene` (`e.target === canvas`).
   */
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  /** Called by the Reload button. Defaults to `window.location.reload()`. */
  onReload?: () => void;
}

function readDevicePixelRatio(): number {
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio;
}

/** `window.devicePixelRatio`, updated on resize and on resolution changes. */
function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(readDevicePixelRatio);
  useEffect(() => {
    let query: MediaQueryList | null = null;
    const update = () => {
      setRatio(readDevicePixelRatio());
      watchResolution();
    };
    // A `(resolution: Ndppx)` query fires `change` when the ratio moves away
    // from N, which happens without a resize when a window changes monitor.
    const watchResolution = () => {
      query?.removeEventListener('change', update);
      query =
        typeof window.matchMedia === 'function'
          ? window.matchMedia(`(resolution: ${readDevicePixelRatio()}dppx)`)
          : null;
      query?.addEventListener('change', update);
    };
    window.addEventListener('resize', update);
    watchResolution();
    return () => {
      window.removeEventListener('resize', update);
      query?.removeEventListener('change', update);
    };
  }, []);
  return ratio;
}

interface BoundaryProps {
  onError: (error: unknown) => void;
  children: ReactNode;
}

/** Catches errors thrown in the scene (R3F rethrows them outside `<Canvas>`). */
class SceneErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn('The 3D view stopped.', error, info.componentStack);
    this.props.onError(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** HTML notice shown in place of the canvas. */
export function SceneFailureNotice({ onReload }: { onReload: () => void }) {
  return (
    <div className="pointer-events-auto flex h-full w-full items-center justify-center bg-background">
      <div className="panel flex-col items-center text-foreground" role="alert">
        <p>{SCENE_FAILURE_MESSAGE}</p>
        <Button onClick={onReload}>{SCENE_RELOAD_LABEL}</Button>
      </div>
    </div>
  );
}

const defaultReload = () => window.location.reload();

export function SceneCanvas({ controller = null, onCanvasReady, onReload = defaultReload }: SceneCanvasProps) {
  const lowQuality = useAppStore((s) => s.lowQuality);
  const devicePixelRatio = useDevicePixelRatio();
  const config = canvasConfig(devicePixelRatio, lowQuality);
  const [failure, setFailure] = useState<SceneFailure | null>(null);

  return (
    <div className="fixed inset-0" onContextMenu={(e) => e.preventDefault()}>
      {failure ? (
        <SceneFailureNotice onReload={onReload} />
      ) : (
        <SceneErrorBoundary onError={(error) => setFailure({ kind: 'error', error })}>
          <LiveCanvas
            config={config}
            controller={controller}
            onCanvasReady={onCanvasReady}
            onContextLost={() => setFailure({ kind: 'contextLost' })}
          />
        </SceneErrorBoundary>
      )}
    </div>
  );
}

interface LiveCanvasProps {
  config: CanvasConfig;
  controller: PickTarget | null;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onContextLost: () => void;
}

/**
 * The R3F canvas while it is live. It watches for context loss and hands the
 * canvas element to the playfield. The listener is removed in a layout-effect
 * cleanup: this component is the parent of `<Canvas>`, so on deletion its
 * cleanup runs before R3F tears the renderer down, and the context loss R3F
 * forces then (`forceContextLoss`) is not mistaken for a failure.
 */
function LiveCanvas({ config, controller, onCanvasReady, onContextLost }: LiveCanvasProps) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const callbacks = useRef({ onCanvasReady, onContextLost });
  useLayoutEffect(() => {
    callbacks.current = { onCanvasReady, onContextLost };
  });

  useLayoutEffect(() => {
    if (!canvas) return;
    const onLost = (event: Event) => {
      // Lets the browser restore the context; the canvas is replaced by the
      // notice anyway, and the Reload button starts a fresh one.
      event.preventDefault();
      console.warn('The WebGL context was lost.');
      callbacks.current.onContextLost();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    callbacks.current.onCanvasReady?.(canvas);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      callbacks.current.onCanvasReady?.(null);
    };
  }, [canvas]);

  return (
    <Canvas
      dpr={config.dpr}
      shadows={config.shadows}
      gl={config.gl}
      camera={config.camera}
      onCreated={(state: RootState) => setCanvas(state.gl.domElement)}
    >
      <Scene controller={controller} />
    </Canvas>
  );
}
