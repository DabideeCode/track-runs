import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/persistence/storage';
import {
  AUDIO_KEY,
  SETTINGS_KEY,
  createSettingsRepository,
} from '@/persistence/settingsRepository';

const DEFAULT_AUDIO = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 };

function setup(init?: Record<string, string>) {
  const storage = memoryStorage(init);
  const warn = vi.fn();
  const repo = createSettingsRepository({ storage, warn });
  return { storage, warn, repo };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settingsRepository', () => {
  it('uses the expected storage keys', () => {
    expect(AUDIO_KEY).toBe('wooden-diorama:audio');
    expect(SETTINGS_KEY).toBe('wooden-diorama:settings');
  });

  it('returns defaults without a warning when the keys are missing', () => {
    const { repo, warn } = setup();
    expect(repo.loadAudio()).toEqual(DEFAULT_AUDIO);
    expect(repo.loadApp()).toEqual({ lowQuality: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns defaults and logs one warning per key for invalid JSON', () => {
    const { repo, warn } = setup({ [AUDIO_KEY]: '{not json', [SETTINGS_KEY]: '' });
    expect(repo.loadAudio()).toEqual(DEFAULT_AUDIO);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(repo.loadApp()).toEqual({ lowQuality: false });
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('replaces only the invalid audio field with its default, with one warning', () => {
    const { repo, warn } = setup({
      [AUDIO_KEY]: JSON.stringify({ muted: true, musicVolume: 1.5, sfxVolume: 0.2 }),
    });
    expect(repo.loadAudio()).toEqual({ muted: true, musicVolume: 0.5, sfxVolume: 0.2 });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back to lowQuality false with a warning for a non-boolean value', () => {
    const { repo, warn } = setup({ [SETTINGS_KEY]: JSON.stringify({ lowQuality: 'yes' }) });
    expect(repo.loadApp()).toEqual({ lowQuality: false });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('round-trips audio and app settings, writing only the known fields', () => {
    const { repo, storage, warn } = setup();
    const audio = { muted: true, musicVolume: 0.25, sfxVolume: 1, extra: 'x' };
    expect(repo.saveAudio(audio)).toBe(true);
    expect(JSON.parse(storage.getItem(AUDIO_KEY) as string)).toEqual({
      muted: true,
      musicVolume: 0.25,
      sfxVolume: 1,
    });
    expect(repo.loadAudio()).toEqual({ muted: true, musicVolume: 0.25, sfxVolume: 1 });

    expect(repo.saveApp({ lowQuality: true })).toBe(true);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY) as string)).toEqual({ lowQuality: true });
    expect(repo.loadApp()).toEqual({ lowQuality: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it('clamps volumes to 0..1 when saving', () => {
    const { repo } = setup();
    repo.saveAudio({ muted: false, musicVolume: 2, sfxVolume: -0.5 });
    expect(repo.loadAudio()).toEqual({ muted: false, musicVolume: 1, sfxVolume: 0 });
  });

  it('warns, returns false and keeps the stored value when a write fails', () => {
    const storedAudio = JSON.stringify({ muted: false, musicVolume: 0.3, sfxVolume: 0.4 });
    const storedApp = JSON.stringify({ lowQuality: false });
    const { repo, storage, warn } = setup({ [AUDIO_KEY]: storedAudio, [SETTINGS_KEY]: storedApp });
    storage.setFailWrites(true);
    const errorSpy = vi.spyOn(console, 'error');

    expect(repo.saveAudio({ muted: true, musicVolume: 1, sfxVolume: 1 })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(repo.saveApp({ lowQuality: true })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);

    expect(storage.getItem(AUDIO_KEY)).toBe(storedAudio);
    expect(storage.getItem(SETTINGS_KEY)).toBe(storedApp);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('uses console.warn by default', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = createSettingsRepository({ storage: memoryStorage({ [AUDIO_KEY]: 'bad' }) });
    repo.loadAudio();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
