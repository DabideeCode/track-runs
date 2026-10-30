// @vitest-environment jsdom
/**
 * Scene composition (task 14.14). Each scene layer is replaced by a probe
 * that records its props and renders nothing, so `Scene` can be rendered by
 * react-dom without WebGL. The store is a real one from the store harness.
 *
 * Requirements: 2.6, 7.3, 32.1
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Scene } from '@/scene/Scene';
import { AppStoreProvider } from '@/store/useAppStore';
import { createHarness, disposeHarnesses } from '../../unit/store/harness';

const { probe, layer } = vi.hoisted(() => {
  const probe = { calls: new Map<string, Array<Record<string, unknown>>>() };
  const layer = (name: string) => () => ({
    [name]: (props: Record<string, unknown>) => {
      const list = probe.calls.get(name) ?? [];
      list.push(props);
      probe.calls.set(name, list);
      return null;
    },
  });
  return { probe, layer };
});

vi.mock('@/scene/CameraRig', layer('CameraRig'));
vi.mock('@/scene/Lighting', layer('Lighting'));
vi.mock('@/scene/GridLines', layer('GridLines'));
vi.mock('@/scene/TileHighlight', layer('TileHighlight'));
vi.mock('@/scene/pieces/PieceLayer', layer('PieceLayer'));
vi.mock('@/scene/pieces/ActivePiece', layer('ActivePiece'));
vi.mock('@/scene/pieces/BlobShadows', layer('BlobShadows'));
vi.mock('@/scene/pieces/OpenEndMarkers', layer('OpenEndMarkers'));
vi.mock('@/scene/pieces/PickProxies', layer('PickProxies'));
vi.mock('@/scene/settings/BedroomSetting', layer('BedroomSetting'));
vi.mock('@/scene/settings/KitchenSetting', layer('KitchenSetting'));
vi.mock('@/scene/train/TrainView', layer('TrainView'));

const LAYERS = [
  'CameraRig',
  'Lighting',
  'BedroomSetting',
  'KitchenSetting',
  'GridLines',
  'TileHighlight',
  'PieceLayer',
  'ActivePiece',
  'BlobShadows',
  'OpenEndMarkers',
  'PickProxies',
  'TrainView',
];

const last = (name: string) => probe.calls.get(name)?.at(-1);

beforeEach(() => probe.calls.clear());
afterEach(() => {
  cleanup();
  disposeHarnesses();
});

describe('Scene', () => {
  it('renders every scene layer once and no HTML of its own', () => {
    const h = createHarness();
    const controller = { setPickPiece: () => {} };
    const { container } = render(
      <AppStoreProvider store={h.store}>
        <Scene controller={controller} />
      </AppStoreProvider>,
    );
    for (const name of LAYERS) expect(probe.calls.get(name), name).toHaveLength(1);
    expect(last('PickProxies')?.controller).toBe(controller);
    expect(container.innerHTML).toBe('');
  });

  it('passes a null controller to PickProxies by default', () => {
    const h = createHarness();
    render(
      <AppStoreProvider store={h.store}>
        <Scene />
      </AppStoreProvider>,
    );
    expect(last('PickProxies')?.controller).toBeNull();
  });

  it('keeps both settings mounted and shows only the active one', () => {
    const h = createHarness();
    act(() => h.store.getState().newDiorama());
    render(
      <AppStoreProvider store={h.store}>
        <Scene />
      </AppStoreProvider>,
    );
    expect(last('BedroomSetting')?.visible).toBe(true);
    expect(last('KitchenSetting')?.visible).toBe(false);
    act(() => {
      h.store.getState().setSetting('kitchen');
    });
    expect(last('BedroomSetting')?.visible).toBe(false);
    expect(last('KitchenSetting')?.visible).toBe(true);
  });
});
