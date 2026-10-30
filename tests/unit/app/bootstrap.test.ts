// @vitest-environment jsdom
/**
 * Unit tests for `src/app/bootstrap.ts`: the services build on memory storage,
 * the stored audio and quality settings are applied, and the test hook module
 * is loaded and installed only when the condition holds.
 *
 * Requirements: 3.1, 27.8, 33.4, 38.1, 38.2, 38.3, 38.4, 38.5
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppServices, installTestHookIfAllowed, TOAST_STORAGE_UNAVAILABLE, type AppServices } from '@/app/bootstrap';
import { createAudioManager, type AudioManager } from '@/audio/AudioManager';
import type { MusicController } from '@/audio/music';
import { AUDIO_KEY, SETTINGS_KEY } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import type { HookTarget } from '@/testHook/installTestHook';

/** A real audio manager on fake Howler parts: no Web Audio, no files, recorded music volume. */
function fakeAudio(): { audio: AudioManager; musicVolumes: number[]; musicStarts: () => number } {
  const musicVolumes: number[] = [];
  let starts = 0;
  const music: MusicController = {
    start: () => {
      starts++;
      return Promise.resolve();
    },
    setVolume: (v: number) => {
      musicVolumes.push(v);
    },
    stop: () => {},
  } as unknown as MusicController;
  const audio = createAudioManager({
    howler: { getContext: () => null, getMasterGain: () => null },
    createHowl: () => ({ play: () => 0, volume: () => 0, state: () => 'loading', unload: () => {} }),
    music,
    warn: () => {},
  });
  return { audio, musicVolumes, musicStarts: () => starts };
}

const created: AppServices[] = [];
function build(...args: Parameters<typeof createAppServices>): AppServices {
  const s = createAppServices(...args);
  created.push(s);
  return s;
}

afterEach(() => {
  for (const s of created.splice(0)) s.dispose();
});

describe('createAppServices', () => {
  it('builds every service on memory storage and starts on the menu', () => {
    const { audio } = fakeAudio();
    const s = build({ storage: memoryStorage(), audio, window: null, warn: () => {} });
    const state = s.store.getState();
    expect(state.screen).toBe('menu');
    expect(state.savedList).toEqual([]);
    expect(state.toasts).toEqual([]);
    expect(s.trainRuntime.snapshot()).toBeNull();
    expect(s.sceneBridge.isReady()).toBe(false);
  });

  it('applies the stored audio and quality settings', () => {
    const storage = memoryStorage({
      [AUDIO_KEY]: JSON.stringify({ muted: true, musicVolume: 0.25, sfxVolume: 0.4 }),
      [SETTINGS_KEY]: JSON.stringify({ lowQuality: true }),
    });
    const { audio, musicVolumes } = fakeAudio();
    const s = build({ storage, audio, window: null, warn: () => {} });
    expect(s.store.getState().audio).toEqual({ muted: true, musicVolume: 0.25, sfxVolume: 0.4 });
    expect(s.store.getState().lowQuality).toBe(true);
    expect(audio.settings).toEqual({ muted: true, musicVolume: 0.25, sfxVolume: 0.4 });
    // Muted: the music gain is 0.
    expect(musicVolumes.at(-1)).toBe(0);
  });

  it('connects the train runtime to the store, so the parked train follows the pieces', () => {
    const { audio } = fakeAudio();
    const s = build({ storage: memoryStorage(), audio, window: null, warn: () => {} });
    s.store.getState().newDiorama();
    const r = s.store.getState().placePiece('station', 3, 4, { autoAdjust: false });
    expect(r.ok).toBe(true);
    expect(s.trainRuntime.snapshot()).toMatchObject({ pieceId: r.ok ? r.id : '', progress: 0.5, moving: false });
  });

  it('unlocks audio only on the first user gesture and clears drive keys on blur', () => {
    const { audio, musicStarts } = fakeAudio();
    const s = build({ storage: memoryStorage(), audio, window, warn: () => {} });
    expect(audio.unlocked).toBe(false);
    expect(musicStarts()).toBe(0);
    window.dispatchEvent(new Event('pointerdown'));
    expect(audio.unlocked).toBe(true);
    expect(musicStarts()).toBe(1);

    s.trainRuntime.setKeys({ w: true });
    window.dispatchEvent(new Event('blur'));
    expect(s.trainRuntime.getKeys()).toEqual({ w: false, s: false });
  });

  it('shows one toast when storage does not persist', () => {
    const mem = memoryStorage();
    const storage = { persistent: false, getItem: mem.getItem, setItem: mem.setItem, keys: mem.keys };
    const { audio } = fakeAudio();
    const s = build({ storage, audio, window: null, warn: () => {} });
    expect(s.store.getState().toasts.map((t) => t.text)).toEqual([TOAST_STORAGE_UNAVAILABLE]);
  });
});

describe('installTestHookIfAllowed', () => {
  it('does not load the hook module without DEV or ?test=1', async () => {
    const { audio } = fakeAudio();
    const s = build({ storage: memoryStorage(), audio, window: null, warn: () => {} });
    const load = vi.fn(() => import('@/testHook/installTestHook'));
    const target: HookTarget = {};
    for (const search of ['', '?test=0', '?test=true', '?foo=1']) {
      const installed = await installTestHookIfAllowed(s, { location: { search }, env: { DEV: false }, load, target });
      expect(installed).toBe(false);
    }
    expect(load).not.toHaveBeenCalled();
    expect(target.__DIORAMA__).toBeUndefined();
  });

  it('installs the hook with ?test=1 and in development, wired to the same store', async () => {
    const { audio } = fakeAudio();
    const s = build({ storage: memoryStorage(), audio, window: null, warn: () => {} });

    const target: HookTarget = {};
    const load = vi.fn(() => import('@/testHook/installTestHook'));
    expect(await installTestHookIfAllowed(s, { location: { search: '?test=1' }, env: { DEV: false }, load, target })).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    const hook = target.__DIORAMA__;
    expect(hook).toBeDefined();
    expect(target.__DIORAMA_DEBUG__).toBeDefined();

    s.store.getState().newDiorama();
    const placed = hook!.placePiece('straight', 2, 2);
    expect(placed.ok).toBe(true);
    expect(s.store.getState().pieces).toHaveLength(1);
    expect(hook!.getSoundLog()).toEqual(['place']);

    const devTarget: HookTarget = {};
    expect(await installTestHookIfAllowed(s, { location: { search: '' }, env: { DEV: true }, target: devTarget })).toBe(true);
    expect(devTarget.__DIORAMA__).toBeDefined();
  });
});
