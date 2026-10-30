// @vitest-environment jsdom
/**
 * Playfield overlay controls (task 15.4): TopBar, ActionBar and ViewPanel,
 * rendered against a real store built by the store harness (memory storage,
 * recording audio, real train runtime) and a real SceneBridge with no scene
 * registered (its `resetView` is watched with a pass-through spy).
 *
 * Requirements: 7.1, 7.9, 9.8, 12.7, 12.8, 17.3, 17.10, 18.1, 20.1, 20.6,
 * 22.1, 25.10, 27.6, 33.3, 37.9, 37.10, 37.11, 40.6, 41.3
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAVE_KEY } from '@/persistence/saveRepository';
import { SceneBridge } from '@/runtime/SceneBridge';
import { SceneBridgeContext } from '@/scene/context';
import { AppStoreProvider } from '@/store/useAppStore';
import { ActionBar } from '@/ui/ActionBar';
import { TopBar } from '@/ui/TopBar';
import { ViewPanel } from '@/ui/ViewPanel';
import { createHarness, disposeHarnesses, type Harness } from '../../unit/store/harness';

beforeAll(() => {
  // Radix Slider and Tooltip measure elements with ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  disposeHarnesses();
});

const IDS = [
  'back-to-menu',
  'save-button',
  'mode-toggle',
  'drive-toggle',
  'flip-direction',
  'setting-select',
  'delete-piece',
  'reset-view',
  'mute-toggle',
  'music-volume',
  'sfx-volume',
] as const;

function renderControls(setup?: (h: Harness) => void) {
  const h = createHarness({ start: 'playfield' });
  setup?.(h);
  h.audio.clearLog();
  const bridge = new SceneBridge();
  const resetView = vi.spyOn(bridge, 'resetView');
  render(
    <AppStoreProvider store={h.store}>
      <SceneBridgeContext.Provider value={bridge}>
        <TopBar />
        <ActionBar />
        <ViewPanel />
      </SceneBridgeContext.Provider>
    </AppStoreProvider>,
  );
  return { h, resetView, user: userEvent.setup() };
}

const withStation = (h: Harness) => {
  h.store.getState().placePiece('station', 4, 4);
};

const byId = (id: string) => screen.getByTestId(id);

describe('overlay controls', () => {
  it('renders each test id exactly once, and every control has an accessible name', () => {
    renderControls();
    for (const id of IDS) expect(screen.getAllByTestId(id)).toHaveLength(1);

    expect(byId('back-to-menu')).toHaveAccessibleName('Back to menu');
    expect(byId('save-button')).toHaveAccessibleName('Save');
    expect(byId('mode-toggle')).toHaveAccessibleName('Play');
    expect(byId('drive-toggle')).toHaveAccessibleName('Manual driving');
    expect(byId('flip-direction')).toHaveAccessibleName('Flip direction');
    expect(byId('delete-piece')).toHaveAccessibleName('Delete selected piece');
    expect(byId('reset-view')).toHaveAccessibleName('Reset view');
    expect(byId('mute-toggle')).toHaveAccessibleName('Mute');
    expect(screen.getByRole('radiogroup', { name: 'Setting' })).toBe(byId('setting-select'));
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Low quality' })).toBeInTheDocument();

    // Every button, toggle and slider thumb in the panels has a non-empty name.
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('slider')];
    expect(controls.length).toBeGreaterThanOrEqual(13);
    for (const el of controls) expect(el).toHaveAccessibleName(/\S/);
  });

  it('shows the diorama name and an unsaved marker while dirty', () => {
    const { h } = renderControls(withStation);
    const name = h.store.getState().dioramaName;
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('disables the drive toggle and the delete button in Build mode with no selection', () => {
    renderControls(withStation);
    expect(byId('drive-toggle')).toBeDisabled();
    expect(byId('flip-direction')).toBeEnabled();
    expect(byId('delete-piece')).toBeDisabled();
    expect(byId('mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(byId('mode-toggle')).toHaveAttribute('data-value', 'build');
    for (const item of within(byId('setting-select')).getAllByRole('radio')) expect(item).toBeEnabled();
  });

  it('disables Flip direction, delete, undo and redo in Play mode and keeps the setting enabled', async () => {
    const { h, user } = renderControls((h) => {
      withStation(h);
      h.store.getState().selectPiece(h.store.getState().pieces[0].id);
    });
    expect(byId('delete-piece')).toBeEnabled();
    await user.click(byId('mode-toggle'));
    expect(h.store.getState().mode).toBe('play');
    expect(byId('mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(byId('mode-toggle')).toHaveAttribute('data-value', 'play');
    expect(byId('drive-toggle')).toBeEnabled();
    expect(byId('flip-direction')).toBeDisabled();
    expect(byId('delete-piece')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    expect(byId('save-button')).toBeEnabled();
    for (const item of within(byId('setting-select')).getAllByRole('radio')) expect(item).toBeEnabled();
    expect(h.audio.log[0]).toBe('ui');

    // Activating the disabled controls changes nothing and plays nothing.
    h.audio.clearLog();
    const before = h.store.getState().startFacing;
    await user.click(byId('flip-direction'));
    await user.click(byId('delete-piece'));
    expect(h.store.getState().startFacing).toBe(before);
    expect(h.store.getState().pieces).toHaveLength(1);
    expect(h.audio.log).toEqual([]);

    await user.click(byId('mode-toggle'));
    expect(h.store.getState().mode).toBe('build');
    expect(byId('mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps Build mode when Play is requested without a station', async () => {
    const { h, user } = renderControls();
    await user.click(byId('mode-toggle'));
    expect(h.store.getState().mode).toBe('build');
    expect(byId('mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    expect(h.audio.log).toEqual(['ui', 'invalid']);
  });

  it('switches the drive mode in Play mode', async () => {
    const { h, user } = renderControls((h) => {
      withStation(h);
      h.store.getState().setMode('play');
    });
    expect(byId('drive-toggle')).toHaveAttribute('data-value', 'auto');
    await user.click(byId('drive-toggle'));
    expect(h.store.getState().driveMode).toBe('manual');
    expect(byId('drive-toggle')).toHaveAttribute('data-value', 'manual');
    expect(byId('drive-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(h.audio.log.filter((e) => e === 'ui')).toHaveLength(1);
  });

  it('offers exactly the two settings and changes the setting in both modes', async () => {
    const { h, user } = renderControls();
    const select = byId('setting-select');
    const items = within(select).getAllByRole('radio');
    expect(items.map((el) => el.textContent)).toEqual(['Bedroom floor', 'Kitchen table']);
    expect(select).toHaveAttribute('data-value', 'bedroom');
    expect(items[0]).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: 'Kitchen table' }));
    expect(h.store.getState().setting).toBe('kitchen');
    expect(h.store.getState().isDirty).toBe(true);
    expect(select).toHaveAttribute('data-value', 'kitchen');
    expect(h.audio.log).toEqual(['ui']);

    // Clicking the active item keeps it selected.
    await user.click(screen.getByRole('radio', { name: 'Kitchen table' }));
    expect(h.store.getState().setting).toBe('kitchen');
    expect(select).toHaveAttribute('data-value', 'kitchen');
    expect(h.audio.log).toEqual(['ui', 'ui']);
  });

  it('flips the start direction once per activation in Build mode', async () => {
    const { h, user } = renderControls();
    expect(byId('flip-direction')).toHaveAttribute('data-value', '0');
    await user.click(byId('flip-direction'));
    expect(h.store.getState().startFacing).toBe(180);
    expect(byId('flip-direction')).toHaveAttribute('data-value', '180');
    expect(h.audio.log).toEqual(['ui']);
  });

  it('saves with the Save button and leaves with Back to menu when clean', async () => {
    const { h, user } = renderControls(withStation);
    await user.click(byId('save-button'));
    expect(h.storage.getItem(SAVE_KEY)).not.toBeNull();
    expect(h.store.getState().isDirty).toBe(false);
    expect(h.audio.log).toEqual(['ui']);

    await user.click(byId('back-to-menu'));
    expect(h.store.getState().screen).toBe('menu');
    expect(h.audio.log).toEqual(['ui', 'ui']);
  });

  it('opens the unsaved-changes dialog from Back to menu when dirty', async () => {
    const { h, user } = renderControls(withStation);
    await user.click(byId('back-to-menu'));
    expect(h.store.getState().screen).toBe('playfield');
    expect(h.store.getState().dialog).toEqual({ kind: 'unsaved' });
  });

  it('deletes the selected piece, then undoes and redoes it', async () => {
    const { h, user } = renderControls((h) => {
      withStation(h);
      h.store.getState().selectPiece(h.store.getState().pieces[0].id);
    });
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();

    await user.click(byId('delete-piece'));
    expect(h.store.getState().pieces).toEqual([]);
    expect(h.store.getState().selectedPieceId).toBeNull();
    expect(h.audio.log).toEqual(['ui', 'delete']);
    expect(byId('delete-piece')).toBeDisabled();

    h.audio.clearLog();
    await user.click(undo);
    expect(h.store.getState().pieces).toHaveLength(1);
    expect(redo).toBeEnabled();
    await user.click(redo);
    expect(h.store.getState().pieces).toEqual([]);
    expect(h.audio.log).toEqual(['ui', 'ui']);
  });

  it('resets the view through the scene bridge without dirtying the diorama', async () => {
    const { h, user, resetView } = renderControls();
    await user.click(byId('reset-view'));
    expect(resetView).toHaveBeenCalledTimes(1);
    expect(h.store.getState().isDirty).toBe(false);
    expect(h.audio.log).toEqual(['ui']);
  });

  it('toggles Low quality and mute, and persists them', async () => {
    const { h, user } = renderControls();
    const low = screen.getByRole('button', { name: 'Low quality' });
    await user.click(low);
    expect(h.store.getState().lowQuality).toBe(true);
    expect(low).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(h.storage.getItem('wooden-diorama:settings')!)).toEqual({ lowQuality: true });

    await user.click(byId('mute-toggle'));
    expect(h.store.getState().audio.muted).toBe(true);
    expect(byId('mute-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(h.storage.getItem('wooden-diorama:audio')!)).toMatchObject({ muted: true });
    expect(h.audio.log).toEqual(['ui', 'ui']);
  });

  it('gives the volume sliders named thumbs from 0 to 1 and applies keyboard steps of 0.01', async () => {
    const { h, user } = renderControls();
    const music = within(byId('music-volume')).getByRole('slider');
    const sfx = within(byId('sfx-volume')).getByRole('slider');
    expect(music).toHaveAccessibleName('Music volume');
    expect(sfx).toHaveAccessibleName('Effects volume');
    for (const thumb of [music, sfx]) {
      expect(thumb).toHaveAttribute('aria-valuemin', '0');
      expect(thumb).toHaveAttribute('aria-valuemax', '1');
    }
    expect(music).toHaveAttribute('aria-valuenow', String(h.store.getState().audio.musicVolume));
    expect(sfx).toHaveAttribute('aria-valuenow', String(h.store.getState().audio.sfxVolume));

    const startMusic = h.store.getState().audio.musicVolume;
    music.focus();
    await user.keyboard('{ArrowRight}');
    expect(h.store.getState().audio.musicVolume).toBeCloseTo(startMusic + 0.01, 10);

    const startSfx = h.store.getState().audio.sfxVolume;
    sfx.focus();
    await user.keyboard('{ArrowLeft}');
    expect(h.store.getState().audio.sfxVolume).toBeCloseTo(startSfx - 0.01, 10);
    expect(sfx).toHaveAttribute('aria-valuenow', String(h.store.getState().audio.sfxVolume));
    expect(h.audio.log).toEqual(['ui', 'ui']);
  });
});
