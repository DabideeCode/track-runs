/**
 * Audio and app settings persistence (Requirements 27.7, 27.8, 27.9, 33.4,
 * 33.5, 36.6; design section 2).
 *
 * Reads and writes `wooden-diorama:audio` (`{ muted, musicVolume, sfxVolume }`)
 * and `wooden-diorama:settings` (`{ lowQuality }`). Parsing is delegated to
 * `saveFormat.ts`. Nothing here throws or calls `console.error`: bad stored
 * values and failed writes are reported with one warning each, and the caller
 * keeps its in-memory value when a write fails.
 */
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_AUDIO_SETTINGS,
  parseAppSettings,
  parseAudioSettings,
} from '@/domain/saveFormat';
import type { AppSettings, AudioSettings } from '@/domain/types';
import type { KeyValueStorage, WarnFn } from './storage';

export const AUDIO_KEY = 'wooden-diorama:audio';
export const SETTINGS_KEY = 'wooden-diorama:settings';

export interface SettingsRepository {
  /** Stored audio settings, with per-field defaults for missing or invalid values. */
  loadAudio(): AudioSettings;
  /** Writes `{ muted, musicVolume, sfxVolume }`. Returns false (and warns) when the write fails. */
  saveAudio(settings: AudioSettings): boolean;
  /** Stored app settings, or `{ lowQuality: false }` when missing or invalid. */
  loadApp(): AppSettings;
  /** Writes `{ lowQuality }`. Returns false (and warns) when the write fails. */
  saveApp(settings: AppSettings): boolean;
}

export interface SettingsRepositoryDeps {
  storage: KeyValueStorage;
  warn?: WarnFn;
}

const defaultWarn: WarnFn = (message, data) => {
  if (data === undefined) console.warn(message);
  else console.warn(message, data);
};

/** Clamps a volume to 0..1; a non-finite value takes the given default. Turns −0 into 0. */
function clampVolume(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
  const c = Math.min(1, Math.max(0, v));
  return c === 0 ? 0 : c;
}

export function createSettingsRepository(deps: SettingsRepositoryDeps): SettingsRepository {
  const { storage } = deps;
  const warn = deps.warn ?? defaultWarn;

  const read = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch (error) {
      warn(`Reading "${key}" failed; using defaults.`, error);
      return null;
    }
  };

  const write = (key: string, value: unknown): boolean => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      warn(`Writing "${key}" failed; the setting is kept for this session only.`, error);
      return false;
    }
  };

  return {
    loadAudio() {
      const raw = read(AUDIO_KEY);
      const { settings, warn: bad } = parseAudioSettings(raw);
      if (bad) warn(`Stored audio settings under "${AUDIO_KEY}" are invalid; using defaults for the invalid fields.`, raw);
      return settings;
    },
    saveAudio(s) {
      return write(AUDIO_KEY, {
        muted: s.muted === true,
        musicVolume: clampVolume(s.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
        sfxVolume: clampVolume(s.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
      });
    },
    loadApp() {
      const raw = read(SETTINGS_KEY);
      const { settings, warn: bad } = parseAppSettings(raw);
      if (bad) warn(`Stored app settings under "${SETTINGS_KEY}" are invalid; using defaults.`, raw);
      return settings;
    },
    saveApp(s) {
      return write(SETTINGS_KEY, {
        lowQuality: typeof s.lowQuality === 'boolean' ? s.lowQuality : DEFAULT_APP_SETTINGS.lowQuality,
      });
    },
  };
}
