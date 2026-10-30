import { afterEach, describe, expect, it } from 'vitest';
import type { AudioPort } from '@/audio/types';
import type { AudioSettings, Piece, SoundEvent } from '@/domain/types';
import { createSaveRepository } from '@/persistence/saveRepository';
import { AUDIO_KEY, SETTINGS_KEY, createSettingsRepository } from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import { AUTOSAVE_MS } from '@/domain/autosave';
import { TOAST_NO_STATION, createAppStore, type AppStore } from '@/store/createAppStore';
import type { AppDeps, Timers } from '@/store/ports';

// Inline fakes; the shared harness comes with task 10.5.

function recordingAudio(): AudioPort & { log: SoundEvent[]; applied: AudioSettings[] } {
  const log: SoundEvent[] = [];
  const applied: AudioSettings[] = [];
  return {
    log,
    applied,
    play: (e) => void log.push(e),
    startChug: () => void log.push('chug'),
    setChugLevel: () => {},
    stopChug: () => {},
    apply: (s) => void applied.push({ ...s }),
    getLog: () => [...log],
  };
}

type TrainCall =
  | { kind: 'enterPlay'; pieces: readonly Piece[]; startFacing: 0 | 180 }
  | { kind: 'exitPlay' }
  | { kind: 'setDriveMode'; mode: 'auto' | 'manual' };

/** Timers that never fire; these tests drive time through the clock only. */
const idleTimers: Timers = {
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
};

const stores: AppStore[] = [];
afterEach(() => {
  for (const s of stores.splice(0)) s.getState().dispose();
});

function setup() {
  const storage = memoryStorage();
  const audio = recordingAudio();
  const clock = { now: Date.parse('2026-10-29T10:00:00.000Z') };
  const trainCalls: TrainCall[] = [];
  let pieceN = 0;
  const deps: AppDeps = {
    audio,
    train: {
      enterPlay: (pieces, startFacing) => void trainCalls.push({ kind: 'enterPlay', pieces, startFacing }),
      exitPlay: () => void trainCalls.push({ kind: 'exitPlay' }),
      setDriveMode: (mode) => void trainCalls.push({ kind: 'setDriveMode', mode }),
      snapshot: () => null,
    },
    scene: { captureThumbnail: () => null, resetView: () => {} },
    saves: createSaveRepository({ storage, now: () => new Date(clock.now), newId: () => 'd1', warn: () => {} }),
    settings: createSettingsRepository({ storage, warn: () => {} }),
    now: () => clock.now,
    newId: () => `p${++pieceN}`,
    timers: idleTimers,
    warn: () => {},
  };
  const store = createAppStore(deps);
  stores.push(store);
  store.getState().newDiorama();
  return { store, storage, audio, clock, trainCalls, get: () => store.getState() };
}

/** A new diorama with a station, saved so it starts clean. */
function withStation() {
  const t = setup();
  t.get().placePiece('station', 4, 4);
  t.get().placePiece('straight', 4, 3);
  t.get().save();
  t.audio.log.length = 0;
  return t;
}

describe('setMode', () => {
  it('rejects Play mode without a station with a toast, invalid and no_station', () => {
    const t = setup();
    t.get().placePiece('house', 1, 1);
    t.audio.log.length = 0;
    expect(t.get().setMode('play')).toEqual({ ok: false, reason: 'no_station' });
    expect(t.get().mode).toBe('build');
    expect(t.get().toasts.map((x) => x.text)).toEqual([TOAST_NO_STATION]);
    expect(t.audio.log).toEqual(['invalid']);
    expect(t.trainCalls).toEqual([]);
  });

  it('enters Play mode: cancels the drag, clears selection and hover, sets auto and starts the train', () => {
    const t = withStation();
    const station = t.get().pieces[0]!;
    t.get().flipStartFacing();
    t.get().selectTool('house');
    t.get().beginDrag({ source: 'board', pieceId: station.id, tile: { gridX: 6, gridZ: 6 } });
    t.store.setState({ driveMode: 'manual', hoverTile: { gridX: 1, gridZ: 1 }, hoverPieceId: station.id });
    t.audio.log.length = 0;
    const piecesBefore = t.get().pieces;

    expect(t.get().setMode('play')).toEqual({ ok: true });
    const s = t.get();
    expect(s).toMatchObject({
      mode: 'play',
      driveMode: 'auto',
      drag: null,
      selectedPieceId: null,
      hoverTile: null,
      hoverPieceId: null,
      selectedTool: 'house',
      isDirty: true,
      startFacing: 180,
    });
    expect(s.pieces).toBe(piecesBefore);
    expect(t.trainCalls).toEqual([{ kind: 'enterPlay', pieces: piecesBefore, startFacing: 180 }]);
    // The train runtime plays whistle and chug; the store adds nothing.
    expect(t.audio.log).toEqual([]);
  });

  it('keeps isDirty unchanged when entering and leaving Play mode', () => {
    const t = withStation();
    expect(t.get().isDirty).toBe(false);
    t.get().setMode('play');
    expect(t.get().isDirty).toBe(false);
    t.get().setMode('build');
    expect(t.get().isDirty).toBe(false);
  });

  it('rejects every build action in Play mode with play_mode', () => {
    const t = withStation();
    const id = t.get().pieces[0]!.id;
    t.get().setMode('play');
    t.audio.log.length = 0;
    const before = t.get().pieces;
    expect(t.get().placePiece('house', 0, 0)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.get().movePiece(id, 0, 0)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.get().rotatePiece(id)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.get().removePiece(id)).toEqual({ ok: false, reason: 'play_mode' });
    expect(t.get().pieces).toBe(before);
    expect(t.audio.log).toEqual(['invalid', 'invalid', 'invalid', 'invalid']);
  });

  it('leaving Play mode stops the train and restarts the autosave timer only when dirty', () => {
    const clean = withStation();
    clean.get().setMode('play');
    expect(clean.get().setMode('build')).toEqual({ ok: true });
    expect(clean.get().mode).toBe('build');
    expect(clean.trainCalls.map((c) => c.kind)).toEqual(['enterPlay', 'exitPlay']);
    expect(clean.get().autosaveDueAt).toBeNull();

    const dirty = withStation();
    dirty.get().setSetting('kitchen');
    dirty.get().setMode('play');
    dirty.clock.now += 50_000;
    dirty.get().setMode('build');
    expect(dirty.get().autosaveDueAt).toBe(dirty.clock.now + AUTOSAVE_MS);
  });

  it('same-mode calls return ok and do nothing', () => {
    const t = withStation();
    expect(t.get().setMode('build')).toEqual({ ok: true });
    expect(t.trainCalls).toEqual([]);
    t.get().setMode('play');
    expect(t.get().setMode('play')).toEqual({ ok: true });
    expect(t.trainCalls.map((c) => c.kind)).toEqual(['enterPlay']);
    expect(t.audio.log).toEqual([]);
  });

  it('an unknown mode value changes nothing', () => {
    const t = withStation();
    expect(t.get().setMode('fly')).toEqual({ ok: false, reason: 'not_found' });
    expect(t.get().mode).toBe('build');
    expect(t.audio.log).toEqual([]);
  });
});

describe('drive mode', () => {
  it('setDriveMode sets the field in either mode and passes it to the train', () => {
    const t = withStation();
    t.get().setDriveMode('manual');
    expect(t.get().driveMode).toBe('manual');
    t.get().setMode('play');
    expect(t.get().driveMode).toBe('auto');
    t.get().setDriveMode('manual');
    expect(t.get().driveMode).toBe('manual');
    t.get().setDriveMode('sideways');
    expect(t.get().driveMode).toBe('manual');
    expect(t.trainCalls.filter((c) => c.kind === 'setDriveMode')).toEqual([
      { kind: 'setDriveMode', mode: 'manual' },
      { kind: 'setDriveMode', mode: 'manual' },
    ]);
  });

  it('toggleDriveMode switches only in Play mode', () => {
    const t = withStation();
    expect(t.get().toggleDriveMode()).toBe(false);
    expect(t.get().driveMode).toBe('auto');
    t.get().setMode('play');
    expect(t.get().toggleDriveMode()).toBe(true);
    expect(t.get().driveMode).toBe('manual');
    expect(t.get().toggleDriveMode()).toBe(true);
    expect(t.get().driveMode).toBe('auto');
    expect(t.get().isDirty).toBe(false);
  });
});

describe('flipStartFacing', () => {
  it('toggles 0 and 180 in Build mode and sets isDirty with an autosave due', () => {
    const t = withStation();
    expect(t.get().flipStartFacing()).toBe(true);
    expect(t.get()).toMatchObject({ startFacing: 180, isDirty: true, autosaveDueAt: t.clock.now + AUTOSAVE_MS });
    expect(t.get().flipStartFacing()).toBe(true);
    expect(t.get().startFacing).toBe(0);
  });

  it('is ignored in Play mode', () => {
    const t = withStation();
    t.get().setMode('play');
    expect(t.get().flipStartFacing()).toBe(false);
    expect(t.get()).toMatchObject({ startFacing: 0, isDirty: false });
  });

  it('works without a station, and deleting the station keeps the facing', () => {
    const t = setup();
    expect(t.get().flipStartFacing()).toBe(true);
    expect(t.get().startFacing).toBe(180);
    const r = t.get().placePiece('station', 2, 2);
    t.get().removePiece(r.ok ? r.id! : '');
    expect(t.get().startFacing).toBe(180);
  });

  it('a new diorama starts at facing 0', () => {
    const t = withStation();
    t.get().flipStartFacing();
    t.get().backToMenu();
    t.get().discardAndLeave();
    t.get().newDiorama();
    expect(t.get().startFacing).toBe(0);
  });
});

describe('setSetting', () => {
  it('sets the setting and isDirty only on a change, keeping pieces and facing', () => {
    const t = withStation();
    const pieces = t.get().pieces;
    expect(t.get().setSetting('bedroom')).toBe(false);
    expect(t.get().isDirty).toBe(false);
    expect(t.get().setSetting('kitchen')).toBe(true);
    expect(t.get()).toMatchObject({ setting: 'kitchen', isDirty: true, startFacing: 0, mode: 'build' });
    expect(t.get().pieces).toBe(pieces);
    expect(t.get().setSetting('attic')).toBe(false);
    expect(t.get().setting).toBe('kitchen');
  });

  it('is allowed in Play mode and does not touch the train', () => {
    const t = withStation();
    t.get().setMode('play');
    t.get().setDriveMode('manual');
    const calls = t.trainCalls.length;
    expect(t.get().setSetting('kitchen')).toBe(true);
    expect(t.get()).toMatchObject({ setting: 'kitchen', mode: 'play', driveMode: 'manual', isDirty: true });
    expect(t.trainCalls).toHaveLength(calls);
  });
});

describe('audio settings', () => {
  const stored = (t: ReturnType<typeof setup>) => JSON.parse(t.storage.getItem(AUDIO_KEY) ?? 'null');

  it('persist and apply each change, clamping volumes to 0..1', () => {
    const t = setup();
    t.get().setMusicVolume(1.7);
    expect(t.get().audio.musicVolume).toBe(1);
    t.get().setSfxVolume(-0.2);
    expect(t.get().audio.sfxVolume).toBe(0);
    t.get().setMusicVolume(0.25);
    expect(stored(t)).toEqual({ muted: false, musicVolume: 0.25, sfxVolume: 0 });
    expect(t.audio.applied.at(-1)).toEqual({ muted: false, musicVolume: 0.25, sfxVolume: 0 });
    t.get().setSfxVolume(Number.NaN);
    expect(t.get().audio.sfxVolume).toBe(0);
  });

  it('mute keeps the stored volumes and unmute restores them', () => {
    const t = setup();
    t.get().setMusicVolume(0.3);
    t.get().setSfxVolume(0.6);
    t.get().setMuted(true);
    expect(stored(t)).toEqual({ muted: true, musicVolume: 0.3, sfxVolume: 0.6 });
    t.get().setMuted(false);
    expect(t.get().audio).toEqual({ muted: false, musicVolume: 0.3, sfxVolume: 0.6 });
    expect(t.audio.applied.at(-1)).toEqual({ muted: false, musicVolume: 0.3, sfxVolume: 0.6 });
  });

  it('an unchanged value writes and applies nothing', () => {
    const t = setup();
    t.get().setMuted(false);
    t.get().setMusicVolume(0.5);
    expect(t.storage.getItem(AUDIO_KEY)).toBeNull();
    expect(t.audio.applied).toEqual([]);
  });

  it('a failed write keeps the in-memory value', () => {
    const t = setup();
    t.storage.setFailWrites(true);
    t.get().setMuted(true);
    t.get().setMusicVolume(0.1);
    expect(t.get().audio).toMatchObject({ muted: true, musicVolume: 0.1 });
    expect(t.audio.applied.at(-1)).toMatchObject({ muted: true, musicVolume: 0.1 });
    expect(t.storage.getItem(AUDIO_KEY)).toBeNull();
  });
});

describe('low quality', () => {
  it('persists the toggle and leaves the editor state alone', () => {
    const t = withStation();
    t.get().setLowQuality(true);
    expect(t.get()).toMatchObject({ lowQuality: true, isDirty: false });
    expect(JSON.parse(t.storage.getItem(SETTINGS_KEY) ?? 'null')).toEqual({ lowQuality: true });
    t.get().setLowQuality(false);
    expect(JSON.parse(t.storage.getItem(SETTINGS_KEY) ?? 'null')).toEqual({ lowQuality: false });
  });

  it('a failed write keeps the in-memory value', () => {
    const t = setup();
    t.storage.setFailWrites(true);
    t.get().setLowQuality(true);
    expect(t.get().lowQuality).toBe(true);
    expect(t.storage.getItem(SETTINGS_KEY)).toBeNull();
  });
});
