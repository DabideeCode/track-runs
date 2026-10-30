// @vitest-environment jsdom
/**
 * Integrated playfield overlay (task 15.8). The full `App` is rendered on the
 * playfield screen, so the top bar, palette, action bar, view panel, dialogs
 * and toasts are all mounted together, against a real store from the store
 * harness, a real SceneBridge (its `rayFromClient` stubbed, since no camera is
 * registered) and the harness's real TrainRuntime. jsdom has no WebGL, so
 * `SceneCanvas` is replaced by a stand-in that renders a real `<canvas>` and
 * hands it to `onCanvasReady`, like the real one.
 *
 * Requirements: 10.1, 10.4, 10.5, 10.6, 10.7, 12.8, 16.13, 20.6, 37.12,
 * 37.13, 40.6
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { CATALOGUE } from '@/domain/catalogue';
import type { PieceType } from '@/domain/types';
import { SceneBridge } from '@/runtime/SceneBridge';
import { SceneBridgeContext, TrainRuntimeContext } from '@/scene/context';
import { AppStoreProvider } from '@/store/useAppStore';
import { STATION_LIMIT_TOOLTIP } from '@/ui/Palette';
import { playfieldLoader } from '@/ui/playfieldLoader';
import { createHarness, disposeHarnesses, type Harness } from '../unit/store/harness';

vi.mock('@/scene/SceneCanvas', async () => {
  const React = await import('react');
  function SceneCanvas(props: { onCanvasReady?: (c: HTMLCanvasElement | null) => void }) {
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

beforeAll(async () => {
  // The playfield is code-split (D-59). Loading the chunk up front makes
  // `playfieldLoader.component()` return the loaded component, so `App`
  // renders the playfield with no Suspense step and the tests can query it
  // synchronously. The loading state itself is covered in App.test.tsx.
  await playfieldLoader.load();
  // Radix Slider and Tooltip measure elements with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom has no Pointer Capture API; Radix Toast's swipe handling calls it.
  const proto = Element.prototype as Partial<Element>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  disposeHarnesses();
  // No flow in this file may log a console error (Requirement 40.4).
  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});

const TRACKS: PieceType[] = ['straight', 'curve', 'tunnel', 'station', 'buffer'];
const DECORATIONS: PieceType[] = ['house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks'];
const LABELS: Record<PieceType, string> = {
  straight: 'Straight track',
  curve: 'Curved track',
  tunnel: 'Tunnel',
  station: 'Station',
  buffer: 'Buffer stop',
  house: 'Toy house',
  pineTree: 'Pine tree',
  roundTree: 'Round tree',
  hill: 'Hill',
  car: 'Toy car',
  cassette: 'Cassette tape',
  blocks: 'Building blocks',
};

/** Requirement 37.13: at most one element at a time for each of these ids. */
const SINGLE_INSTANCE_IDS = [
  'main-menu',
  'new-diorama',
  'diorama-list',
  'rename-input',
  'confirm-ok',
  'confirm-discard',
  'playfield',
  ...CATALOGUE.map((c) => `palette-${c.type}`),
  'mode-toggle',
  'drive-toggle',
  'setting-select',
  'flip-direction',
  'save-button',
  'back-to-menu',
  'delete-piece',
  'reset-view',
  'mute-toggle',
  'music-volume',
  'sfx-volume',
];

/** Ids that the playfield always shows, in both modes and while disabled. */
const PLAYFIELD_IDS = [
  'playfield',
  ...CATALOGUE.map((c) => `palette-${c.type}`),
  'mode-toggle',
  'drive-toggle',
  'setting-select',
  'flip-direction',
  'save-button',
  'back-to-menu',
  'delete-piece',
  'reset-view',
  'mute-toggle',
  'music-volume',
  'sfx-volume',
];

const MENU_IDS = ['main-menu', 'new-diorama', 'diorama-list', 'rename-input'];

function renderPlayfield(): Harness {
  const h = createHarness({ start: 'playfield' });
  const bridge = new SceneBridge();
  vi.spyOn(bridge, 'rayFromClient').mockImplementation(() => null);
  render(
    <AppStoreProvider store={h.store}>
      <SceneBridgeContext.Provider value={bridge}>
        <TrainRuntimeContext.Provider value={h.train}>
          <App />
        </TrainRuntimeContext.Provider>
      </SceneBridgeContext.Provider>
    </AppStoreProvider>,
  );
  return h;
}

const byId = (id: string) => screen.getByTestId(id);
const item = (type: PieceType) => byId(`palette-${type}`);

function placeStation(h: Harness) {
  act(() => {
    expect(h.store.getState().placePiece('station', 4, 4, { rotation: 0, autoAdjust: false }).ok).toBe(true);
  });
}

function enterPlay(h: Harness) {
  act(() => {
    expect(h.store.getState().setMode('play').ok).toBe(true);
  });
  expect(byId('playfield')).toHaveAttribute('data-mode', 'play');
}

/** Checks Requirement 37.13 and that the playfield ids are all present. */
function expectSingleInstanceIds(extraPresent: string[] = []) {
  for (const id of SINGLE_INSTANCE_IDS) {
    expect(screen.queryAllByTestId(id).length, id).toBeLessThanOrEqual(1);
  }
  for (const id of [...PLAYFIELD_IDS, ...extraPresent]) {
    expect(screen.queryAllByTestId(id), id).toHaveLength(1);
  }
  for (const id of MENU_IDS) expect(screen.queryAllByTestId(id), id).toHaveLength(0);
}

/** Roles of interactive controls (Requirement 40.6). */
const INTERACTIVE_ROLES = [
  'button',
  'radio',
  'slider',
  'textbox',
  'checkbox',
  'switch',
  'combobox',
  'spinbutton',
  'link',
  'tab',
  'menuitem',
] as const;

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  ...INTERACTIVE_ROLES.map((r) => `[role="${r}"]`),
].join(', ');

/**
 * Every interactive control in the document has a non-empty accessible name.
 * Hidden elements are included (`hidden: true`), so the faded Play-mode
 * palette and content behind an open dialog are checked too. Returns the
 * number of controls checked.
 */
function expectAllControlsNamed(): number {
  const byRole = INTERACTIVE_ROLES.flatMap((role) => screen.queryAllByRole(role, { hidden: true }));
  // A DOM sweep as well, in case an element's role is not an interactive one.
  const bySelector = [...document.body.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)];
  const all = new Set<HTMLElement>([...byRole, ...bySelector]);
  for (const el of all) {
    const label = el.getAttribute('data-testid') ?? el.outerHTML.slice(0, 120);
    expect(el, label).toHaveAccessibleName(/\S/);
  }
  return all.size;
}

describe('palette in the playfield', () => {
  it('lists the 12 items once each in labelled Tracks and Decorations groups', () => {
    renderPlayfield();
    const palette = screen.getByRole('complementary', { name: 'Palette' });
    const tracks = within(palette).getByRole('region', { name: 'Tracks' });
    const decorations = within(palette).getByRole('region', { name: 'Decorations' });
    const idsIn = (el: HTMLElement) =>
      within(el)
        .getAllByRole('button')
        .map((b) => b.getAttribute('data-testid'));
    expect(idsIn(tracks)).toEqual(TRACKS.map((t) => `palette-${t}`));
    expect(idsIn(decorations)).toEqual(DECORATIONS.map((t) => `palette-${t}`));
    for (const { type } of CATALOGUE) {
      expect(screen.getAllByTestId(`palette-${type}`)).toHaveLength(1);
      expect(item(type)).toHaveTextContent(new RegExp(`^${LABELS[type]}$`));
      expect(item(type)).toHaveAccessibleName(LABELS[type]);
    }
  });

  it('highlights only the selected tool for each of the 13 selectedTool values', () => {
    const h = renderPlayfield();
    const values: (PieceType | null)[] = [...CATALOGUE.map((c) => c.type), null];
    expect(values).toHaveLength(13);
    for (const tool of values) {
      act(() => h.store.getState().selectTool(tool));
      expect(h.store.getState().selectedTool).toBe(tool);
      for (const { type } of CATALOGUE) {
        const selected = type === tool;
        expect(item(type), `${type} with tool ${tool}`).toHaveAttribute('aria-pressed', String(selected));
        expect(item(type).hasAttribute('data-selected'), `${type} with tool ${tool}`).toBe(selected);
      }
      // The highlight is a visual treatment that differs from every other item.
      const classes = new Set(CATALOGUE.filter((c) => c.type !== tool).map((c) => item(c.type).className));
      expect(classes.size).toBe(1);
      if (tool !== null) expect(classes.has(item(tool).className)).toBe(false);
    }
  });

  it('shows the station item disabled with its tooltip on hover and focus while a station exists', async () => {
    const h = renderPlayfield();
    const user = userEvent.setup();
    expect(item('station')).not.toHaveAttribute('aria-disabled');
    placeStation(h);
    h.audio.clearLog();

    const station = item('station');
    expect(station).toHaveAttribute('aria-disabled', 'true');
    await user.hover(station);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(STATION_LIMIT_TOOLTIP);
    await user.unhover(station);

    act(() => station.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(STATION_LIMIT_TOOLTIP);

    // Clicking, pressing and keyboard activation leave the tool unchanged and show no ghost.
    await user.click(station);
    await user.keyboard('{Enter}');
    fireEvent.pointerDown(station, { button: 0, clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(window, { button: 0, clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(window, { button: 0, clientX: 60, clientY: 60, pointerId: 1 });
    expect(h.store.getState().selectedTool).toBeNull();
    expect(h.store.getState().drag).toBeNull();
    expect(h.audio.log).toEqual([]);
  });

  it('disables the palette in Play mode: clicks and drags leave selectedTool unchanged and show no ghost', async () => {
    const h = renderPlayfield();
    placeStation(h);
    act(() => h.store.getState().selectTool('house'));
    enterPlay(h);
    h.audio.clearLog();

    const palette = screen.getByRole('complementary', { name: 'Palette', hidden: true });
    expect(palette).toHaveAttribute('data-state', 'hidden');
    for (const { type } of CATALOGUE) expect(item(type)).toBeDisabled();

    // The panel is `pointer-events: none` in Play mode; click through the check anyway.
    await userEvent.setup({ pointerEventsCheck: 0 }).click(item('curve'));
    fireEvent.pointerDown(item('hill'), { button: 0, clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(window, { button: 0, clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(window, { button: 0, clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.click(item('car'), { detail: 0 });
    expect(h.store.getState().selectedTool).toBe('house');
    expect(h.store.getState().drag).toBeNull();
    expect(h.audio.log.filter((e) => e === 'ui' || e === 'pickup')).toEqual([]);

    act(() => void h.store.getState().setMode('build'));
    expect(palette).toHaveAttribute('data-state', 'visible');
    for (const { type } of CATALOGUE) expect(item(type)).toBeEnabled();
  });
});

describe('toggle and button disabled states', () => {
  it('in Build mode: drive toggle disabled and inert; delete disabled until a piece is selected', async () => {
    const h = renderPlayfield();
    const user = userEvent.setup();
    expect(byId('drive-toggle')).toBeDisabled();
    expect(byId('flip-direction')).toBeEnabled();
    expect(byId('mode-toggle')).toBeEnabled();
    expect(byId('delete-piece')).toBeDisabled();

    h.audio.clearLog();
    await user.click(byId('drive-toggle'));
    expect(h.store.getState().driveMode).toBe('auto');
    expect(h.audio.log).toEqual([]);

    placeStation(h);
    expect(byId('delete-piece')).toBeDisabled();
    act(() => h.store.getState().selectPiece(h.store.getState().pieces[0].id));
    expect(byId('delete-piece')).toBeEnabled();
    act(() => h.store.getState().selectPiece(null));
    expect(byId('delete-piece')).toBeDisabled();
  });

  it('in Play mode: drive toggle enabled; flip direction, delete, undo and redo disabled', async () => {
    const h = renderPlayfield();
    const user = userEvent.setup();
    placeStation(h);
    act(() => h.store.getState().selectPiece(h.store.getState().pieces[0].id));
    expect(byId('delete-piece')).toBeEnabled();

    await user.click(byId('mode-toggle'));
    expect(byId('playfield')).toHaveAttribute('data-mode', 'play');
    expect(byId('drive-toggle')).toBeEnabled();
    expect(byId('flip-direction')).toBeDisabled();
    expect(byId('delete-piece')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(byId('save-button')).toBeEnabled();
    expect(byId('back-to-menu')).toBeEnabled();

    await user.click(byId('drive-toggle'));
    expect(h.store.getState().driveMode).toBe('manual');
    expect(byId('drive-toggle')).toHaveAttribute('aria-pressed', 'true');

    await user.click(byId('mode-toggle'));
    expect(byId('playfield')).toHaveAttribute('data-mode', 'build');
    expect(byId('drive-toggle')).toBeDisabled();
    expect(byId('flip-direction')).toBeEnabled();
  });
});

describe('toasts', () => {
  it('renders one data-testid="toast" element per message, containing its text', () => {
    const h = renderPlayfield();
    expect(screen.queryAllByTestId('toast')).toHaveLength(0);
    act(() => {
      h.store.getState().pushToast('First message', 'info');
      h.store.getState().pushToast('Second message', 'success');
    });
    const toasts = screen.getAllByTestId('toast');
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toHaveTextContent('First message');
    expect(toasts[1]).toHaveTextContent('Second message');

    // A rejected Play-mode entry shows its toast alongside the others.
    act(() => void h.store.getState().setMode('play'));
    expect(byId('playfield')).toHaveAttribute('data-mode', 'build');
    const after = screen.getAllByTestId('toast');
    expect(after).toHaveLength(3);
    expect(after[2]).toHaveTextContent('Place a station to start');
  });
});

describe('accessible names and single-instance test ids', () => {
  it('holds in Build mode, Play mode, with toasts and with the unsaved-changes dialog open', async () => {
    const h = renderPlayfield();
    const user = userEvent.setup();

    // Build mode, clean, nothing selected.
    expectSingleInstanceIds();
    expect(expectAllControlsNamed()).toBeGreaterThanOrEqual(12 + 14);

    // Build mode with a selection and toasts.
    placeStation(h);
    act(() => {
      h.store.getState().selectPiece(h.store.getState().pieces[0].id);
      h.store.getState().pushToast('One', 'info');
      h.store.getState().pushToast('Two', 'error');
    });
    expectSingleInstanceIds();
    expectAllControlsNamed();
    expect(screen.getAllByTestId('toast')).toHaveLength(2);

    // Play mode, with toasts.
    enterPlay(h);
    act(() => void h.store.getState().pushToast('Three', 'success'));
    expectSingleInstanceIds();
    expectAllControlsNamed();

    // Back in Build mode, the diorama is dirty: Back to menu opens the dialog.
    act(() => void h.store.getState().setMode('build'));
    await user.click(byId('back-to-menu'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName(/\S/);
    expectSingleInstanceIds(['confirm-ok', 'confirm-discard']);
    expect(within(dialog).getByTestId('confirm-ok')).toHaveAccessibleName('Save');
    expect(within(dialog).getByTestId('confirm-discard')).toHaveAccessibleName('Discard');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expectAllControlsNamed();
    expect(screen.getAllByTestId('toast').length).toBeGreaterThanOrEqual(1);

    // Cancel closes it; the dialog ids disappear and the playfield ids stay single.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expectSingleInstanceIds();
    expect(screen.queryAllByTestId('confirm-ok')).toHaveLength(0);
    expect(screen.queryAllByTestId('confirm-discard')).toHaveLength(0);
  });

  it('names the controls by their function', () => {
    renderPlayfield();
    expect(byId('save-button')).toHaveAccessibleName('Save');
    expect(byId('back-to-menu')).toHaveAccessibleName('Back to menu');
    expect(byId('mode-toggle')).toHaveAccessibleName('Play');
    expect(byId('drive-toggle')).toHaveAccessibleName('Manual driving');
    expect(byId('flip-direction')).toHaveAccessibleName('Flip direction');
    expect(byId('delete-piece')).toHaveAccessibleName('Delete selected piece');
    expect(byId('reset-view')).toHaveAccessibleName('Reset view');
    expect(byId('mute-toggle')).toHaveAccessibleName('Mute');
    expect(byId('setting-select')).toHaveAccessibleName('Setting');
    expect(within(byId('music-volume')).getByRole('slider')).toHaveAccessibleName('Music volume');
    expect(within(byId('sfx-volume')).getByRole('slider')).toHaveAccessibleName('Effects volume');
    expect(screen.getByRole('radio', { name: 'Bedroom floor' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Kitchen table' })).toBeInTheDocument();
  });
});
