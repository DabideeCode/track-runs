// @vitest-environment jsdom
/**
 * Palette (task 15.3), rendered against a real store (store harness) and a
 * real DragController listening on `window`, with a scene bridge that maps
 * every point off the grid.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 16.6, 16.13, 28.1, 37.8, 41.2
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CATALOGUE } from '@/domain/catalogue';
import type { PieceType } from '@/domain/types';
import { DragController } from '@/input/DragController';
import { AppStoreProvider } from '@/store/useAppStore';
import { Palette, STATION_LIMIT_TOOLTIP } from '@/ui/Palette';
import { createHarness, disposeHarnesses } from '../../unit/store/harness';

beforeAll(() => {
  // Radix Tooltip measures elements with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

let detach: (() => void) | null = null;
afterEach(() => {
  detach?.();
  detach = null;
  cleanup();
  disposeHarnesses();
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

function renderPalette() {
  const h = createHarness({ start: 'playfield' });
  const controller = new DragController({
    store: h.store,
    bridge: { rayFromClient: () => null },
    playUi: () => h.store.getState().playUi(),
  });
  detach = controller.attach();
  render(
    <AppStoreProvider store={h.store}>
      <Palette controller={controller} />
    </AppStoreProvider>,
  );
  return { h, controller };
}

const item = (type: PieceType) => screen.getByTestId(`palette-${type}`);
const placeStation = (h: ReturnType<typeof createHarness>) => {
  const r = h.store.getState().placePiece('station', 4, 4, { rotation: 0, autoAdjust: false });
  expect(r.ok).toBe(true);
  h.audio.clearLog();
};

describe('Palette layout', () => {
  it('lists the 12 items once each in Tracks and Decorations groups of 2 columns, with icon and exact name', () => {
    renderPalette();
    const tracks = screen.getByRole('region', { name: 'Tracks' });
    const decorations = screen.getByRole('region', { name: 'Decorations' });
    const idsIn = (el: HTMLElement) =>
      within(el)
        .getAllByRole('button')
        .map((b) => b.getAttribute('data-testid'));
    expect(idsIn(tracks)).toEqual(TRACKS.map((t) => `palette-${t}`));
    expect(idsIn(decorations)).toEqual(DECORATIONS.map((t) => `palette-${t}`));
    for (const group of [tracks, decorations]) {
      expect(group.querySelector('[data-palette-grid]')?.className).toMatch(/\bgrid-cols-2\b/);
    }
    for (const { type } of CATALOGUE) {
      const els = screen.getAllByTestId(`palette-${type}`);
      expect(els).toHaveLength(1);
      expect(els[0]).toHaveTextContent(new RegExp(`^${LABELS[type]}$`));
      expect(els[0]).toHaveAccessibleName(LABELS[type]);
      expect(els[0].querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }
    expect(screen.getAllByRole('button')).toHaveLength(12);
  });
});

describe('highlight', () => {
  it.each([...CATALOGUE.map((c) => c.type), null] as (PieceType | null)[])(
    'highlights only the selected tool (%s)',
    (tool) => {
      const { h } = renderPalette();
      act(() => h.store.getState().selectTool(tool));
      expect(h.store.getState().selectedTool).toBe(tool);
      for (const { type } of CATALOGUE) {
        const pressed = type === tool;
        expect(item(type)).toHaveAttribute('aria-pressed', String(pressed));
        expect(item(type).hasAttribute('data-selected')).toBe(pressed);
      }
    },
  );
});

describe('input', () => {
  it('pointer-down hands the gesture to the drag controller', () => {
    const { controller } = renderPalette();
    fireEvent.pointerDown(item('curve'), { clientX: 40, clientY: 50, button: 0, pointerId: 1 });
    expect(controller.phase).toMatchObject({ kind: 'palettePress', type: 'curve', startX: 40, startY: 50 });
  });

  it('a mouse click selects the tool once and plays a single ui click', async () => {
    const { h } = renderPalette();
    await userEvent.click(item('hill'));
    expect(h.store.getState().selectedTool).toBe('hill');
    expect(h.audio.getLog()).toEqual(['ui']);
    await userEvent.click(item('car'));
    expect(h.store.getState().selectedTool).toBe('car');
    expect(item('car')).toHaveAttribute('aria-pressed', 'true');
    expect(item('hill')).toHaveAttribute('aria-pressed', 'false');
    expect(h.audio.getLog()).toEqual(['ui', 'ui']);
  });

  it('a click event with detail > 0 does not select by itself', () => {
    const { h } = renderPalette();
    fireEvent.click(item('house'), { detail: 1 });
    expect(h.store.getState().selectedTool).toBeNull();
    expect(h.audio.getLog()).toEqual([]);
  });

  it('keyboard activation (Enter, Space) selects the tool and plays ui', async () => {
    const { h, controller } = renderPalette();
    act(() => item('tunnel').focus());
    await userEvent.keyboard('{Enter}');
    expect(h.store.getState().selectedTool).toBe('tunnel');
    expect(h.audio.getLog()).toEqual(['ui']);
    act(() => item('blocks').focus());
    await userEvent.keyboard(' ');
    expect(h.store.getState().selectedTool).toBe('blocks');
    expect(h.audio.getLog()).toEqual(['ui', 'ui']);
    expect(controller.phase.kind).toBe('idle');
  });
});

describe('station limit', () => {
  it('is aria-disabled with the tooltip on focus while a station exists, and cannot be selected', async () => {
    const { h, controller } = renderPalette();
    expect(item('station')).not.toHaveAttribute('aria-disabled');
    act(() => placeStation(h));
    const station = item('station');
    expect(station).toHaveAttribute('aria-disabled', 'true');
    expect(station).toBeEnabled();

    act(() => station.focus());
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(STATION_LIMIT_TOOLTIP);

    await userEvent.keyboard('{Enter}');
    await userEvent.click(station);
    fireEvent.pointerDown(station, { clientX: 1, clientY: 1, button: 0, pointerId: 1 });
    expect(controller.phase.kind).toBe('idle');
    expect(h.store.getState().selectedTool).toBeNull();
    expect(h.audio.getLog()).toEqual([]);
    // The other items stay usable.
    expect(item('straight')).not.toHaveAttribute('aria-disabled');
  });

  it('shows the tooltip on hover', async () => {
    const { h } = renderPalette();
    act(() => placeStation(h));
    await userEvent.hover(item('station'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(STATION_LIMIT_TOOLTIP);
  });

  it('shows no tooltip without a station', async () => {
    renderPalette();
    act(() => item('station').focus());
    await userEvent.hover(item('station'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Play mode', () => {
  it('fades the palette out and disables every item, keeping the test ids', async () => {
    const { h, controller } = renderPalette();
    act(() => {
      placeStation(h);
      h.store.getState().selectTool('house');
    });
    act(() => {
      expect(h.store.getState().setMode('play').ok).toBe(true);
    });
    h.audio.clearLog();
    const panel = item('house').closest('aside')!;
    expect(panel.className).toMatch(/\bduration-200\b/);
    expect(panel.className).toMatch(/\bopacity-0\b/);
    expect(panel).toHaveAttribute('data-state', 'hidden');
    for (const { type } of CATALOGUE) expect(item(type)).toBeDisabled();

    fireEvent.pointerDown(item('curve'), { clientX: 1, clientY: 1, button: 0, pointerId: 1 });
    fireEvent.click(item('curve'), { detail: 0 });
    expect(controller.phase.kind).toBe('idle');
    expect(h.store.getState().selectedTool).toBe('house');
    expect(h.store.getState().drag).toBeNull();
    expect(h.audio.getLog()).toEqual([]);

    act(() => {
      h.store.getState().setMode('build');
    });
    expect(panel.className).toMatch(/\bopacity-100\b/);
    expect(item('curve')).toBeEnabled();
  });
});
