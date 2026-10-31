import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_KEY, loadAudioSettings, saveAudioSettings } from '@/persistence/audioSettings';

const items = new Map<string, string>();

beforeEach(() => {
  items.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DEFAULTS = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 };

describe('audio settings', () => {
  it('uses the key from Section 9', () => {
    expect(AUDIO_KEY).toBe('wooden-diorama:audio');
  });

  it('defaults to unmuted, music 0.5 and effects 0.8', () => {
    expect(loadAudioSettings()).toEqual(DEFAULTS);
  });

  it('round-trips saved values', () => {
    saveAudioSettings({ muted: true, musicVolume: 0.2, sfxVolume: 0 });
    expect(loadAudioSettings()).toEqual({ muted: true, musicVolume: 0.2, sfxVolume: 0 });
  });

  it.each(['{bad', '42', 'null', '[]'])('falls back to defaults for %s', (raw) => {
    items.set(AUDIO_KEY, raw);
    expect(loadAudioSettings()).toEqual(DEFAULTS);
  });

  it('replaces bad fields and clamps volumes to 0 to 1', () => {
    items.set(AUDIO_KEY, JSON.stringify({ muted: 'yes', musicVolume: 7, sfxVolume: -1 }));
    expect(loadAudioSettings()).toEqual({ muted: false, musicVolume: 1, sfxVolume: 0 });
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadAudioSettings()).toEqual(DEFAULTS);
    expect(() => saveAudioSettings(DEFAULTS)).not.toThrow();
  });
});
