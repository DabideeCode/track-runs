// @vitest-environment jsdom
/**
 * App and Playfield wiring (task 15.6). jsdom has no WebGL, so `SceneCanvas`
 * is replaced by a stand-in that renders a real `<canvas>` and hands it to
 * `onCanvasReady`, like the real one. The store is a real one from the store
 * harness; the SceneBridge is real, with its `rayFromClient` stubbed because
 * no camera is registered.
 *
 * Requirements: 2.1, 2.5, 2.6, 3.1, 3.6, 3.8, 30.8, 37.7, 37.13, 37.15, 40.4
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, PLAYFIELD_ERROR_DETAIL, PLAYFIELD_LOADING_LABEL, type AppProps } from '@/App';
import type { Diorama, Tile } from '@/domain/types';
import { SceneBridge } from '@/runtime/SceneBridge';
import { SceneBridgeContext, TrainRuntimeContext } from '@/scene/context';
import { AppStoreProvider } from '@/store/useAppStore';
import { BACK_TO_MENU_LABEL, TRY_AGAIN_LABEL } from '@/ui/ErrorBoundary';
import { createPlayfieldLoader, type PlayfieldModule } from '@/ui/playfieldLoader';
import { createHarness, disposeHarnesses, type Harness, type HarnessOptions } from '../unit/store/harness';

const probe = vi.hoisted(() => ({
  sceneThrows: false,
  topBarThrows: false,
  menuThrows: false,
  sceneProps: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/scene/SceneCanvas', async () => {
  const React = await import('react');
  function SceneCanvas(props: { controller?: unknown; onCanvasReady?: (c: HTMLCanvasElement | null) => void }) {
    probe.sceneProps.push(props);
    if (probe.sceneThrows) throw new Error('scene failed');
    const ref = React.useRef<HTMLCanvasElement>(null);
    const { onCanvasReady } = props;
    React.useLayoutEffect(() => {
      onCanvasReady?.(ref.current);
      return () => onCanvasReady?.(null);
    }, [onCanvasReady]);
    return React.createElement(
      'div',
      { className: 'fixed inset-0' },
      React.createElement('canvas', { ref, 'data-testid': 'scene-canvas' }),
    );
  }
  return { SceneCanvas };
});

vi.mock('@/ui/TopBar', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/ui/TopBar')>();
  return {
    ...mod,
    TopBar: (props: { className?: string }) => {
      if (probe.topBarThrows) throw new Error('top bar failed');
      return mod.TopBar(props);
    },
  };
});

vi.mock('@/ui/MainMenu', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/ui/MainMenu')>();
  return {
    ...mod,
    MainMenu: () => {
      if (probe.menuThrows) throw new Error('menu failed');
      return mod.MainMenu();
    },
  };
});

beforeAll(() => {
  // Radix Slider and Tooltip measure elements with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  probe.sceneThrows = false;
  probe.topBarThrows = false;
  probe.menuThrows = false;
  probe.sceneProps = [];
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  // React's default report for errors caught by a boundary (main.tsx turns it into a warning).
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  disposeHarnesses();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

const SAVED: Diorama = {
  id: 'd-saved',
  name: 'Sunday loop',
  setting: 'bedroom',
  startFacing: 0,
  pieces: [],
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-02T09:00:00.000Z',
};

function renderApp(opts: HarnessOptions = {}, ray: Tile | null = { gridX: 3, gridZ: 4 }, appProps: AppProps = {}) {
  const h: Harness = createHarness(opts);
  h.store.getState().refreshList();
  const bridge = new SceneBridge();
  vi.spyOn(bridge, 'rayFromClient').mockImplementation(() => ray);
  render(
    <AppStoreProvider store={h.store}>
      <SceneBridgeContext.Provider value={bridge}>
        <TrainRuntimeContext.Provider value={h.train}>
          <App {...appProps} />
        </TrainRuntimeContext.Provider>
      </SceneBridgeContext.Provider>
    </AppStoreProvider>,
  );
  return h;
}

/** Renders the app on the playfield and waits for the lazily loaded playfield chunk. */
async function renderPlayfield(opts: HarnessOptions = {}) {
  const h = renderApp({ ...opts, start: 'playfield' });
  await screen.findByTestId('playfield');
  return h;
}

const user = () => userEvent.setup();

describe('App screens', () => {
  it('switches between the main menu and the playfield on screen', async () => {
    const h = renderApp();
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('playfield')).toBeNull();

    await user().click(screen.getByTestId('new-diorama'));
    expect(h.store.getState().screen).toBe('playfield');
    expect(await screen.findByTestId('playfield')).toBeInTheDocument();
    expect(screen.queryByTestId('main-menu')).toBeNull();
    expect(screen.getByTestId('scene-canvas')).toBeInTheDocument();

    await user().click(screen.getByTestId('back-to-menu'));
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('playfield')).toBeNull();
  });

  it('binds data-mode on the playfield to the store mode', async () => {
    const h = await renderPlayfield();
    const playfield = screen.getByTestId('playfield');
    expect(playfield).toHaveAttribute('data-mode', 'build');
    act(() => {
      h.store.getState().placePiece('station', 5, 5, { autoAdjust: true });
      h.store.getState().setMode('play');
    });
    expect(playfield).toHaveAttribute('data-mode', 'play');
    act(() => void h.store.getState().setMode('build'));
    expect(playfield).toHaveAttribute('data-mode', 'build');
  });

  it('keeps the document title "Track"', async () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toMatch(/<title>Track<\/title>/);
    document.title = 'Track';
    renderApp();
    await user().click(screen.getByTestId('new-diorama'));
    await screen.findByTestId('playfield');
    expect(document.title).toBe('Track');
  });
});

describe('Playfield overlay', () => {
  it('puts every panel in a pointer-events-none overlay root; the panels take pointer events', async () => {
    await renderPlayfield();
    const playfield = screen.getByTestId('playfield');
    const overlay = playfield.querySelector('[data-overlay-root]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay).toHaveClass('pointer-events-none');
    expect(overlay.contains(screen.getByTestId('scene-canvas'))).toBe(false);

    const panels = [
      screen.getByTestId('back-to-menu').closest('.panel'),
      screen.getByRole('complementary', { name: 'Palette' }),
      screen.getByTestId('delete-piece').closest('.panel'),
      screen.getByTestId('reset-view').closest('.panel'),
    ];
    for (const panel of panels) {
      expect(panel).not.toBeNull();
      expect(overlay.contains(panel)).toBe(true);
      // The `panel` utility sets `pointer-events: auto`.
      expect(panel).toHaveClass('panel');
    }
    // The palette sits at the left, vertically centred.
    expect(panels[1]).toHaveClass('fixed', 'left-3', 'top-1/2', '-translate-y-1/2');
  });

  it('passes one drag controller to the scene and the palette; canvas presses place, panel releases do not', async () => {
    const h = await renderPlayfield();
    const controllers = new Set(probe.sceneProps.map((p) => p.controller));
    expect(controllers.size).toBe(1);
    expect([...controllers][0]).not.toBeNull();

    const canvas = screen.getByTestId('scene-canvas');
    act(() => void h.store.getState().selectTool('straight'));

    // A click on a panel is not over the scene: nothing is placed.
    const panel = screen.getByTestId('reset-view').closest('.panel')!;
    fireEvent.pointerDown(panel, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(panel, { button: 0, clientX: 10, clientY: 10 });
    expect(h.store.getState().pieces).toHaveLength(0);

    // A click on the canvas places the tool at the tile under the pointer.
    fireEvent.pointerDown(canvas, { button: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(canvas, { button: 0, clientX: 300, clientY: 300 });
    expect(h.store.getState().pieces).toEqual([
      expect.objectContaining({ type: 'straight', gridX: 3, gridZ: 4 }),
    ]);
  });

  it('palette press and release on an item selects the tool through the controller', async () => {
    const h = await renderPlayfield();
    const item = screen.getByTestId('palette-curve');
    fireEvent.pointerDown(item, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(item, { button: 0, clientX: 20, clientY: 20 });
    expect(h.store.getState().selectedTool).toBe('curve');
    expect(h.audio.log).toContain('ui');
  });

  it('mounts the keyboard shortcuts while the playfield is shown, and only then', async () => {
    const h = await renderPlayfield();
    act(() => void h.store.getState().selectTool('house'));
    await user().keyboard('{Escape}');
    expect(h.store.getState().selectedTool).toBeNull();

    act(() => void h.store.getState().placePiece('straight', 2, 2, { autoAdjust: true }));
    const id = h.store.getState().pieces[0].id;
    act(() => void h.store.getState().selectPiece(id));
    await user().keyboard('r');
    expect(h.store.getState().pieces[0].rotation).toBe(90);

    act(() => h.store.getState().backToMenu());
    act(() => h.store.getState().discardAndLeave());
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    // On the menu the listeners are gone (and the store ignores the keys too).
    const before = h.audio.log.length;
    await user().keyboard('f');
    expect(h.audio.log.length).toBe(before);
  });
});

describe('Dialogs and toasts on both screens', () => {
  it('shows the delete dialog and toasts on the main menu', async () => {
    const h = renderApp({ saved: [SAVED] });
    const card = screen.getAllByTestId('diorama-item')[0];
    await user().click(within(card).getByTestId('diorama-delete'));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Sunday loop');
    await user().click(screen.getByTestId('confirm-ok'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryAllByTestId('diorama-item')).toHaveLength(0);

    act(() => void h.store.getState().pushToast('Hello from the menu', 'info'));
    expect(screen.getByTestId('toast')).toHaveTextContent('Hello from the menu');
  });

  it('shows the unsaved-changes dialog and toasts on the playfield', async () => {
    const h = await renderPlayfield();
    act(() => void h.store.getState().placePiece('straight', 1, 1, { autoAdjust: true }));
    await user().click(screen.getByTestId('back-to-menu'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-discard')).toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('playfield')).toBeInTheDocument();

    await user().click(screen.getByTestId('save-button'));
    expect(screen.getByTestId('toast')).toHaveTextContent('Saved');
    expect(h.store.getState().isDirty).toBe(false);
  });
});

describe('Error boundaries', () => {
  it('replaces a crashed playfield with a fallback that warns and returns to the menu after asking about unsaved work', async () => {
    probe.sceneThrows = true;
    const h = renderApp({ start: 'playfield' });
    expect(await screen.findByTestId('error-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('playfield')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('playfield'),
      expect.any(Error),
      expect.anything(),
    );

    // Dirty work: Back to menu asks first, and Discard then leaves.
    act(() => void h.store.getState().placePiece('straight', 1, 1, { autoAdjust: true }));
    expect(h.store.getState().isDirty).toBe(true);
    probe.sceneThrows = false;
    await user().click(screen.getByRole('button', { name: BACK_TO_MENU_LABEL }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await user().click(screen.getByTestId('confirm-discard'));
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('error-fallback')).toBeNull();

    // A fresh playfield renders normally afterwards.
    await user().click(screen.getByTestId('new-diorama'));
    expect(await screen.findByTestId('playfield')).toBeInTheDocument();
  });

  it('keeps the 3D view when only the overlay fails, and offers Back to menu', async () => {
    probe.topBarThrows = true;
    const h = await renderPlayfield();
    expect(screen.getByTestId('playfield')).toBeInTheDocument();
    expect(screen.getByTestId('scene-canvas')).toBeInTheDocument();
    const fallback = screen.getByTestId('error-fallback');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('playfield controls'),
      expect.any(Error),
      expect.anything(),
    );
    probe.topBarThrows = false;
    await user().click(within(fallback).getByRole('button', { name: BACK_TO_MENU_LABEL }));
    expect(h.store.getState().screen).toBe('menu');
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
  });

  it('recovers a crashed main menu with Back to menu', async () => {
    probe.menuThrows = true;
    renderApp({ saved: [SAVED] });
    expect(screen.getByTestId('error-fallback')).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('main menu'),
      expect.any(Error),
      expect.anything(),
    );
    probe.menuThrows = false;
    await user().click(screen.getByRole('button', { name: BACK_TO_MENU_LABEL }));
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    expect(screen.getAllByTestId('diorama-item')).toHaveLength(1);
  });
});

describe('Code-split playfield (task 17.2, Requirement 32.6)', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
  const realModule = () => import('@/ui/Playfield') as Promise<PlayfieldModule>;

  it('shows an accessible loading state on the playfield background until the chunk arrives', async () => {
    const chunk = deferred<PlayfieldModule>();
    const playfieldLoader = createPlayfieldLoader(() => chunk.promise);
    renderApp({ start: 'playfield' }, undefined, { playfieldLoader });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(PLAYFIELD_LOADING_LABEL);
    expect(status.parentElement).toHaveClass('fixed', 'inset-0', 'bg-background');
    expect(screen.queryByTestId('playfield')).toBeNull();

    await act(async () => chunk.resolve(await realModule()));
    expect(await screen.findByTestId('playfield')).toBeInTheDocument();
    expect(screen.queryByText(PLAYFIELD_LOADING_LABEL)).toBeNull();
  });

  it('a chunk that fails to load shows the playfield fallback; Try again loads it, Back to menu leaves', async () => {
    const importModule = vi
      .fn<() => Promise<PlayfieldModule>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockImplementation(realModule);
    const playfieldLoader = createPlayfieldLoader(importModule, () => {});
    const h = renderApp({ start: 'playfield' }, undefined, { playfieldLoader });

    const fallback = await screen.findByTestId('error-fallback');
    expect(fallback).toHaveTextContent(PLAYFIELD_ERROR_DETAIL);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('playfield'), expect.any(Error), expect.anything());

    await user().click(within(fallback).getByRole('button', { name: TRY_AGAIN_LABEL }));
    expect(await screen.findByTestId('playfield')).toBeInTheDocument();
    expect(importModule).toHaveBeenCalledTimes(2);

    // A failure again, then Back to menu: a clean diorama goes straight to the menu.
    const failing = createPlayfieldLoader(() => Promise.reject(new Error('offline')), () => {});
    cleanup();
    const h2 = renderApp({ start: 'playfield' }, undefined, { playfieldLoader: failing });
    const again = await screen.findByTestId('error-fallback');
    await user().click(within(again).getByRole('button', { name: BACK_TO_MENU_LABEL }));
    expect(h2.store.getState().screen).toBe('menu');
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    expect(h.store.getState().screen).toBe('playfield');
  });

  it('prefetches the playfield chunk once the menu has rendered, before any diorama is opened', async () => {
    const importModule = vi.fn(realModule);
    const playfieldLoader = createPlayfieldLoader(importModule);
    renderApp({}, undefined, { playfieldLoader });
    expect(screen.getByTestId('main-menu')).toBeInTheDocument();
    await vi.waitFor(() => expect(importModule).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('playfield')).toBeNull();

    await user().click(screen.getByTestId('new-diorama'));
    expect(await screen.findByTestId('playfield')).toBeInTheDocument();
    expect(importModule).toHaveBeenCalledTimes(1);
  });
});
