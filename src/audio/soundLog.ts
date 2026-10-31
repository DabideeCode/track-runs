import type { SoundEvent } from '@/domain/types';

interface Playback {
  play(event: SoundEvent): void;
  /** Loop level from 0 to 1. 0 stops the chug. */
  setChugLevel(level: number): void;
}

const log: SoundEvent[] = [];
let playback: Playback = { play: () => {}, setChugLevel: () => {} };

/** Logs every event, even while muted or before the first interaction, then asks for playback. */
export function emitSound(event: SoundEvent): void {
  log.push(event);
  playback.play(event);
}

export function getSoundLog(): string[] {
  return [...log];
}

export function setChugLevel(level: number): void {
  playback.setChugLevel(level);
}

export function setPlayback(next: Playback): void {
  playback = next;
}
