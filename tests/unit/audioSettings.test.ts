import { describe, expect, it } from 'vitest';
import {
  AUDIO_KEY,
  DEFAULT_AUDIO_SETTINGS,
  readAudioSettings,
  writeAudioSettings,
} from '@/persistence/audioSettings';
import type { StorageLike } from '@/persistence/saveFile';

function memoryStorage(initial: string | null = null): StorageLike {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
}

describe('audio settings', () => {
  it('uses the agreed defaults', () => {
    expect(DEFAULT_AUDIO_SETTINGS).toEqual({ muted: false, musicVolume: 0.5, sfxVolume: 0.8 });
    expect(readAudioSettings(memoryStorage())).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('round-trips saved values', () => {
    const storage = memoryStorage();
    const settings = { muted: true, musicVolume: 0.2, sfxVolume: 0 };
    writeAudioSettings(settings, storage);
    expect(readAudioSettings(storage)).toEqual(settings);
  });

  it.each([['not json'], ['null'], ['{"muted":"yes"}'], ['{"muted":true,"musicVolume":2,"sfxVolume":0}']])(
    'falls back to defaults for %s',
    (text) => {
      expect(readAudioSettings(memoryStorage(text))).toEqual(DEFAULT_AUDIO_SETTINGS);
    },
  );

  it('survives a storage that throws', () => {
    const storage: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    expect(readAudioSettings(storage)).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(() => writeAudioSettings(DEFAULT_AUDIO_SETTINGS, storage)).not.toThrow();
  });

  it('uses the expected storage key', () => {
    expect(AUDIO_KEY).toBe('wooden-diorama:audio');
  });
});
