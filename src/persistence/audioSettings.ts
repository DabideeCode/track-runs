import type { AudioSettings } from '@/domain/types';

export const AUDIO_KEY = 'wooden-diorama:audio';
export const DEFAULT_AUDIO: AudioSettings = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 };

const volume = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function loadAudioSettings(): AudioSettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_AUDIO;
    const { muted, musicVolume, sfxVolume } = parsed as Partial<Record<keyof AudioSettings, unknown>>;
    return {
      muted: typeof muted === 'boolean' ? muted : DEFAULT_AUDIO.muted,
      musicVolume: volume(musicVolume, DEFAULT_AUDIO.musicVolume),
      sfxVolume: volume(sfxVolume, DEFAULT_AUDIO.sfxVolume),
    };
  } catch (error) {
    console.warn('Could not read audio settings, so defaults are in use:', error);
    return DEFAULT_AUDIO;
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not save audio settings:', error);
  }
}
