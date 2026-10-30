import type { StorageLike } from './saveFile';

export const AUDIO_KEY = 'wooden-diorama:audio';

export interface AudioSettings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 };

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isVolume(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value <= 1;
}

export function readAudioSettings(storage = browserStorage()): AudioSettings {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(AUDIO_KEY) ?? 'null');
    if (typeof parsed === 'object' && parsed !== null) {
      const { muted, musicVolume, sfxVolume } = parsed as Record<string, unknown>;
      if (typeof muted === 'boolean' && isVolume(musicVolume) && isVolume(sfxVolume)) {
        return { muted, musicVolume, sfxVolume };
      }
    }
  } catch {
    // Unreadable settings fall back to the defaults.
  }
  return { ...DEFAULT_AUDIO_SETTINGS };
}

export function writeAudioSettings(settings: AudioSettings, storage = browserStorage()) {
  try {
    storage?.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session.
  }
}
