// @vitest-environment jsdom
/**
 * SceneCanvas (task 14.14). jsdom has no WebGL, so R3F's `<Canvas>` is
 * replaced by a stand-in that records its props, renders a real `<canvas>`
 * and calls `onCreated` with it, and `Scene` is replaced by a probe. The
 * store is a real one from the store harness.
 *
 * Requirements: 2.1, 2.6, 2.8, 9.10, 32.3, 33.2, 33.3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PCFShadowMap } from 'three';
import { SCENE_FAILURE_MESSAGE } from '@/scene/sceneCanvasConfig';
import { SceneCanvas } from '@/scene/SceneCanvas';
import { AppStoreProvider } from '@/store/useAppStore';
import { createHarness, disposeHarnesses } from '../../unit/store/harness';

const probe = vi.hoisted(() => ({
  canvasProps: [] as Array<Record<string, unknown>>,
  sceneProps: [] as Array<Record<string, unknown>>,
  sceneThrows: false,
}));

vi.mock('@react-three/fiber', async () => {
  const React = await import('react');
  function Canvas(props: Record<string, unknown> & { children?: React.ReactNode }) {
    probe.canvasProps.push(props);
    const ref = React.useRef<HTMLCanvasElement>(null);
    const created = React.useRef<HTMLCanvasElement | null>(null);
    React.useEffect(() => {
      created.current = ref.current;
      (props.onCreated as (s: unknown) => void)?.({ gl: { domElement: ref.current } });
      // Called once, like R3F, when the renderer is created.
    }, []);
    // Like R3F, tearing the root down forces a context loss on the canvas.
    React.useInsertionEffect(
      () => () => {
        created.current?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
      },
      [],
    );
    return React.createElement('div', { 'data-r3f': '' }, React.createElement('canvas', { ref }), props.children);
  }
  return { Canvas };
});

vi.mock('@/scene/Scene', () => ({
  Scene: (props: Record<string, unknown>) => {
    probe.sceneProps.push(props);
    if (probe.sceneThrows) throw new Error('scene failed');
    return null;
  },
}));

const lastCanvas = () => probe.canvasProps[probe.canvasProps.length - 1];
const setDevicePixelRatio = (v: number) =>
  Object.defineProperty(window, 'devicePixelRatio', { value: v, configurable: true });

let warnSpy: ReturnType<typeof vi.spyOn>;
const lostWarnings = () =>
  warnSpy.mock.calls.filter((args: unknown[]) => String(args[0]).includes('context was lost')).length;

beforeEach(() => {
  probe.canvasProps.length = 0;
  probe.sceneProps.length = 0;
  probe.sceneThrows = false;
  setDevicePixelRatio(2);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  disposeHarnesses();
  vi.restoreAllMocks();
});

function renderCanvas(props: Parameters<typeof SceneCanvas>[0] = {}) {
  const h = createHarness();
  const view = render(
    <AppStoreProvider store={h.store}>
      <SceneCanvas {...props} />
    </AppStoreProvider>,
  );
  return { h, ...view };
}

describe('SceneCanvas', () => {
  it('fills the viewport with a fixed container and configures the canvas', () => {
    const { container } = renderCanvas();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\bfixed\b/);
    expect(root.className).toMatch(/\binset-0\b/);
    expect(root.querySelector('canvas')).not.toBeNull();
    const p = lastCanvas();
    expect(p.dpr).toBe(1.5);
    expect(p.shadows).toEqual({ enabled: true, type: PCFShadowMap });
    expect((p.camera as { fov: number }).fov).toBe(40);
    expect((p.gl as { antialias: boolean }).antialias).toBe(true);
  });

  it('updates the pixel ratio and shadows when Low quality changes, keeping the canvas', () => {
    const { h, container } = renderCanvas();
    const canvasEl = container.querySelector('canvas');
    act(() => h.store.getState().setLowQuality(true));
    expect(lastCanvas().dpr).toBe(1);
    expect(lastCanvas().shadows).toEqual({ enabled: false, type: PCFShadowMap });
    act(() => h.store.getState().setLowQuality(false));
    expect(lastCanvas().dpr).toBe(1.5);
    expect(container.querySelector('canvas')).toBe(canvasEl);
  });

  it('recomputes the pixel ratio on window resize', () => {
    renderCanvas();
    setDevicePixelRatio(1.25);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(lastCanvas().dpr).toBe(1.25);
  });

  it('suppresses the browser context menu', () => {
    const { container } = renderCanvas();
    const canvasEl = container.querySelector('canvas')!;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvasEl.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('passes the controller to Scene and reports the canvas element', () => {
    const controller = { setPickPiece: () => {} };
    const onCanvasReady = vi.fn();
    const { container, unmount } = renderCanvas({ controller, onCanvasReady });
    expect(probe.sceneProps.at(-1)?.controller).toBe(controller);
    expect(onCanvasReady).toHaveBeenLastCalledWith(container.querySelector('canvas'));
    unmount();
    expect(onCanvasReady).toHaveBeenLastCalledWith(null);
    // The context loss forced during teardown is not reported as a failure.
    expect(lostWarnings()).toBe(0);
  });

  it('shows the failure notice with a Reload button when the scene throws', async () => {
    probe.sceneThrows = true;
    const onReload = vi.fn();
    // React reports the caught error; keep the test output quiet.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderCanvas({ onReload });
    expect(screen.getByRole('alert')).toHaveTextContent(SCENE_FAILURE_MESSAGE);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('replaces the canvas with the notice when the WebGL context is lost', () => {
    const onCanvasReady = vi.fn();
    const { container, h } = renderCanvas({ onCanvasReady });
    const before = h.store.getState().pieces;
    const canvasEl = container.querySelector('canvas')!;
    const lost = new Event('webglcontextlost', { cancelable: true });
    act(() => {
      canvasEl.dispatchEvent(lost);
    });
    expect(lost.defaultPrevented).toBe(true);
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(SCENE_FAILURE_MESSAGE);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(onCanvasReady).toHaveBeenLastCalledWith(null);
    expect(h.store.getState().pieces).toBe(before);
    // Only the real loss is reported, not the one forced while tearing down.
    expect(lostWarnings()).toBe(1);
  });
});
