/**
 * Unit tests for the audio manager (`src/audio/AudioManager.ts`).
 *
 * `howler` is replaced with a recording fake (a fake `Howler` global whose
 * context and master gain the tests set, and a fake `Howl` class), `tone` is
 * replaced with a fake that records when it is loaded, and Web Audio is a
 * small fake AudioContext that records created nodes, connections and
 * scheduled values (adapted from `synth.test.ts`).
 *
 * Requirements: 1.7, 25.8, 26.2, 27.4, 27.5, 27.11
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module fakes (hoisted so the vi.mock factories can use them)
// ---------------------------------------------------------------------------

const fakes = vi.hoisted(() => {
  interface HowlOptions {
    src: string[];
    html5?: boolean;
    preload?: boolean;
    volume?: number;
    onloaderror?: (id: number, error: unknown) => void;
  }
  const howls: FakeHowl[] = [];
  class FakeHowl {
    readonly options: HowlOptions;
    loadState: 'unloaded' | 'loading' | 'loaded' = 'loading';
    vol: number;
    plays = 0;
    unloads = 0;
    readonly volumes: number[] = [];
    constructor(options: HowlOptions) {
      this.options = options;
      this.vol = options.volume ?? 1;
      howls.push(this);
    }
    play() {
      this.plays++;
      return 1;
    }
    volume(v?: number) {
      if (v !== undefined) {
        this.vol = v;
        this.volumes.push(v);
      }
      return this.vol;
    }
    state() {
      return this.loadState;
    }
    unload() {
      this.unloads++;
      this.loadState = 'unloaded';
    }
    stop() {
      return this;
    }
  }
  const howler = {
    ctx: null as unknown,
    masterGain: null as unknown,
    usingWebAudio: true,
    volume: () => 1,
  };
  const tone = { loads: 0 };
  return { howls, FakeHowl, howler, tone };
});

vi.mock('howler', () => ({ Howl: fakes.FakeHowl, Howler: fakes.howler }));

vi.mock('tone', () => {
  fakes.tone.loads++;
  return {
    getContext() {
      throw new Error('fake tone has no audio context');
    },
  };
});

// A shallow copy of the real sound bank, so the file-sound tests can switch
// single entries to `{ kind: 'file' }` and restore them afterwards.
vi.mock('@/audio/soundBank', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/audio/soundBank')>();
  return { ...actual, SOUND_BANK: { ...actual.SOUND_BANK } };
});

import { UNLOCK_EVENTS, createAudioManager, type AudioManager } from '@/audio/AudioManager';
import type { MusicController } from '@/audio/music';
import { SOUND_BANK, synthRecipeNameFor, type SoundSource } from '@/audio/soundBank';
import type { AudioSettings, SoundEvent } from '@/domain/types';

// ---------------------------------------------------------------------------
// Fake Web Audio
// ---------------------------------------------------------------------------

class FakeParam {
  value = 0;
  readonly events: Array<{ kind: string; value: number; time: number }> = [];
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'set', value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'linear', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (!(value > 0)) throw new RangeError('exponential ramp target must be > 0');
    this.events.push({ kind: 'exp', value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number, _tc: number) {
    this.events.push({ kind: 'target', value, time });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events.push({ kind: 'cancel', value: Number.NaN, time });
    return this;
  }
}

class FakeNode {
  readonly outputs = new Set<FakeNode | FakeParam>();
  readonly context: FakeContext;
  readonly kind: string;
  constructor(ctx: FakeContext, kind: string) {
    this.context = ctx;
    this.kind = kind;
    ctx.nodes.push(this);
  }
  connect(target: FakeNode | FakeParam) {
    this.outputs.add(target);
    return target;
  }
  disconnect() {
    this.outputs.clear();
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
  constructor(ctx: FakeContext) {
    super(ctx, 'gain');
    this.gain.value = 1;
  }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  constructor(ctx: FakeContext) {
    super(ctx, 'biquad');
  }
}

class FakeSource extends FakeNode {
  onended: ((ev: Event) => void) | null = null;
  started: number | null = null;
  stopped: number | null = null;
  ended = false;
  start(when = 0) {
    this.started = when;
  }
  stop(when = 0) {
    this.stopped = when;
  }
  end() {
    if (this.ended || this.started === null) return;
    this.ended = true;
    this.onended?.call(this, {} as Event);
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
  constructor(ctx: FakeContext) {
    super(ctx, 'oscillator');
  }
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam();
  constructor(ctx: FakeContext) {
    super(ctx, 'bufferSource');
    this.playbackRate.value = 1;
  }
}

class FakeConstantSource extends FakeSource {
  readonly offset = new FakeParam();
  constructor(ctx: FakeContext) {
    super(ctx, 'constantSource');
  }
}

class FakeBuffer {
  private readonly channels: Float32Array[];
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(i: number) {
    return this.channels[i]!;
  }
}

class FakeContext {
  currentTime = 0;
  readonly sampleRate = 8000;
  state: 'suspended' | 'running' = 'suspended';
  resumes = 0;
  readonly nodes: FakeNode[] = [];
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    return new FakeGain(this);
  }
  createBiquadFilter() {
    return new FakeFilter(this);
  }
  createOscillator() {
    return new FakeOscillator(this);
  }
  createBufferSource() {
    return new FakeBufferSource(this);
  }
  createConstantSource() {
    return new FakeConstantSource(this);
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeBuffer(channels, length, rate);
  }
  sources() {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }
  finishAll() {
    for (const s of this.sources()) s.end();
  }
}

/** The last scheduled (or directly set) value of a param. */
function lastValue(param: FakeParam): number {
  const scheduled = param.events.filter((e) => e.kind !== 'cancel');
  return scheduled.length > 0 ? scheduled[scheduled.length - 1]!.value : param.value;
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

function fakeMusic() {
  const music = {
    start: vi.fn(() => Promise.resolve()),
    setVolume: vi.fn<(volume: number) => void>(),
    stop: vi.fn(),
    source: 'none' as const,
  };
  return music satisfies MusicController;
}

interface Rig {
  fake: FakeContext;
  master: FakeGain;
  manager: AudioManager;
  music: ReturnType<typeof fakeMusic>;
  warn: ReturnType<typeof vi.fn>;
  target: EventTarget;
}

/** A manager on the mocked Howler global, with a fake context, music and event target. */
function makeRig(settings?: AudioSettings): Rig {
  const fake = new FakeContext();
  const master = new FakeGain(fake);
  fakes.howler.ctx = fake;
  fakes.howler.masterGain = master;
  const music = fakeMusic();
  const warn = vi.fn();
  const manager = createAudioManager({ music, warn, settings });
  return { fake, master, manager, music, warn, target: new EventTarget() };
}

/** A rig that is already unlocked. */
function unlockedRig(settings?: AudioSettings): Rig {
  const rig = makeRig(settings);
  rig.manager.install(rig.target);
  rig.target.dispatchEvent(new Event('pointerdown'));
  return rig;
}

/** The effects gain: the gain node connected straight to the master gain, created by the first synth one-shot. */
function effectsBus(rig: Rig): FakeGain {
  const bus = rig.fake.nodes.find(
    (n): n is FakeGain => n instanceof FakeGain && n !== rig.master && n.outputs.has(rig.master),
  );
  if (!bus) throw new Error('no effects bus yet');
  return bus;
}

/** The chug's level gain: a gain connected to the master gain that is fed by the looping buffer chain. */
function chugLevel(rig: Rig, bus: FakeGain | null): FakeGain {
  const level = rig.fake.nodes.filter(
    (n): n is FakeGain => n instanceof FakeGain && n !== rig.master && n !== bus && n.outputs.has(rig.master),
  );
  if (level.length !== 1) throw new Error(`expected one chug level gain, found ${level.length}`);
  return level[0]!;
}

function loopSources(rig: Rig): FakeBufferSource[] {
  return rig.fake.nodes.filter((n): n is FakeBufferSource => n instanceof FakeBufferSource && n.loop);
}

/** Every node except the master gain. */
function soundNodes(rig: Rig): FakeNode[] {
  return rig.fake.nodes.filter((n) => n !== rig.master);
}

const DEFAULTS: AudioSettings = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 };

beforeEach(() => {
  fakes.howls.length = 0;
  fakes.howler.ctx = null;
  fakes.howler.masterGain = null;
});

// ---------------------------------------------------------------------------
// Unlock (Requirements 27.4, 27.5)
// ---------------------------------------------------------------------------

describe('unlock', () => {
  it('install registers capture-phase pointerdown and keydown listeners', () => {
    const rig = makeRig();
    const add = vi.spyOn(rig.target, 'addEventListener');
    rig.manager.install(rig.target);

    expect(UNLOCK_EVENTS).toEqual(['pointerdown', 'keydown']);
    expect(add).toHaveBeenCalledTimes(2);
    const names = add.mock.calls.map((c) => c[0]);
    expect(names).toEqual(['pointerdown', 'keydown']);
    for (const call of add.mock.calls) expect(call[2]).toEqual({ capture: true });
    expect(rig.manager.unlocked).toBe(false);
    expect(rig.music.start).not.toHaveBeenCalled();
    expect(rig.fake.resumes).toBe(0);
  });

  it.each(UNLOCK_EVENTS)(
    'the first %s resumes the context, starts the music once and removes the listeners',
    (eventName) => {
      const rig = makeRig();
      const remove = vi.spyOn(rig.target, 'removeEventListener');
      rig.manager.install(rig.target);

      rig.target.dispatchEvent(new Event(eventName));

      expect(rig.manager.unlocked).toBe(true);
      expect(rig.fake.resumes).toBe(1);
      expect(rig.fake.state).toBe('running');
      expect(rig.music.start).toHaveBeenCalledTimes(1);
      expect(rig.music.setVolume).toHaveBeenLastCalledWith(0.5);
      expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(['keydown', 'pointerdown']);
      for (const call of remove.mock.calls) expect(call[2]).toEqual({ capture: true });

      // Later events (of either kind) do nothing more.
      rig.fake.state = 'suspended';
      rig.target.dispatchEvent(new Event('pointerdown'));
      rig.target.dispatchEvent(new Event('keydown'));
      rig.manager.unlock();
      expect(rig.fake.resumes).toBe(1);
      expect(rig.music.start).toHaveBeenCalledTimes(1);
    },
  );

  it('does not resume a context that is already running', () => {
    const rig = makeRig();
    rig.fake.state = 'running';
    rig.manager.install(rig.target);
    rig.target.dispatchEvent(new Event('keydown'));
    expect(rig.manager.unlocked).toBe(true);
    expect(rig.fake.resumes).toBe(0);
    expect(rig.music.start).toHaveBeenCalledTimes(1);
  });

  it('install is idempotent, and its remover stops the listeners from unlocking', () => {
    const rig = makeRig();
    const add = vi.spyOn(rig.target, 'addEventListener');
    const removeA = rig.manager.install(rig.target);
    const removeB = rig.manager.install(rig.target);
    expect(removeB).toBe(removeA);
    expect(add).toHaveBeenCalledTimes(2);

    removeA();
    rig.target.dispatchEvent(new Event('pointerdown'));
    expect(rig.manager.unlocked).toBe(false);
    expect(rig.music.start).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// No deferred playback (Requirements 25.12, 27.5)
// ---------------------------------------------------------------------------

describe('before unlock', () => {
  it('logs sounds but builds no audio nodes, then and after the unlock', () => {
    const rig = makeRig();
    rig.manager.install(rig.target);

    rig.manager.play('place');
    rig.manager.play('delete');
    rig.manager.play('whistle');
    rig.manager.startChug(1.5);
    rig.manager.setChugLevel(1.5);

    expect(rig.manager.getLog()).toEqual(['place', 'delete', 'whistle', 'chug']);
    expect(soundNodes(rig)).toEqual([]);

    rig.target.dispatchEvent(new Event('pointerdown'));
    expect(rig.manager.unlocked).toBe(true);
    // Nothing triggered before the unlock is played afterwards, including the chug.
    expect(soundNodes(rig)).toEqual([]);
    rig.manager.setChugLevel(2);
    expect(soundNodes(rig)).toEqual([]);
    expect(rig.manager.getLog()).toEqual(['place', 'delete', 'whistle', 'chug']);

    // Sounds triggered after the unlock do play.
    rig.manager.play('place');
    expect(rig.fake.sources().length).toBeGreaterThan(0);
    for (const s of rig.fake.sources()) expect(s.started).toBeGreaterThanOrEqual(rig.fake.currentTime);
    expect(rig.manager.getLog()).toEqual(['place', 'delete', 'whistle', 'chug', 'place']);
  });

  it('a chug started before the unlock stays silent until it is started again', () => {
    const rig = makeRig();
    rig.manager.install(rig.target);
    rig.manager.startChug(1.5);
    rig.target.dispatchEvent(new Event('keydown'));
    expect(loopSources(rig)).toEqual([]);

    rig.manager.startChug(1.5);
    expect(loopSources(rig)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Distinct clips (Requirement 25.8)
// ---------------------------------------------------------------------------

/** A description of the node graph one event builds: oscillator and filter settings. */
function graphSignature(event: 'place' | 'delete' | 'invalid'): string {
  const rig = unlockedRig();
  rig.manager.play(event);
  const nodes = soundNodes(rig);
  const parts = nodes.flatMap((n) => {
    if (n instanceof FakeOscillator) return [`osc:${n.type}:${n.frequency.events.map((e) => e.value).join('>')}`];
    if (n instanceof FakeFilter) return [`filter:${n.type}:${n.frequency.events.map((e) => e.value).join('>')}`];
    return [];
  });
  expect(parts.length).toBeGreaterThan(0);
  return parts.sort().join('|');
}

describe('distinct clips', () => {
  it('place, delete and invalid use different synth recipes', () => {
    const names = (['place', 'delete', 'invalid'] as const).map(synthRecipeNameFor);
    expect(new Set(names).size).toBe(3);
  });

  it('place, delete and invalid build different node graphs', () => {
    const place = graphSignature('place');
    const del = graphSignature('delete');
    const invalid = graphSignature('invalid');
    expect(place).not.toBe(del);
    expect(place).not.toBe(invalid);
    expect(del).not.toBe(invalid);
  });
});

// ---------------------------------------------------------------------------
// Volumes and mute (Requirements 26.3, 27.10, 27.11)
// ---------------------------------------------------------------------------

describe('volumes and mute', () => {
  it('apply() updates the live effects gain, the running chug and the music at once', () => {
    const rig = unlockedRig();
    rig.manager.play('place');
    const bus = effectsBus(rig);
    expect(lastValue(bus.gain)).toBeCloseTo(0.8);

    rig.manager.startChug(1.5);
    const level = chugLevel(rig, bus);
    expect(lastValue(level.gain)).toBeCloseTo(0.8 * 0.75);

    rig.manager.apply({ muted: false, musicVolume: 0.3, sfxVolume: 0.4 });
    expect(lastValue(bus.gain)).toBeCloseTo(0.4);
    expect(lastValue(level.gain)).toBeCloseTo(0.4 * 0.75);
    expect(rig.music.setVolume).toHaveBeenLastCalledWith(0.3);
    // The changes are scheduled from the current time, not later.
    expect(bus.gain.events.at(-1)!.time).toBe(rig.fake.currentTime);

    // Later sounds go through the same bus at the new volume.
    rig.manager.play('delete');
    expect(effectsBus(rig)).toBe(bus);
    expect(lastValue(bus.gain)).toBeCloseTo(0.4);

    // The chug follows the speed at the new effects volume.
    rig.manager.setChugLevel(2);
    expect(lastValue(level.gain)).toBeCloseTo(0.4);
  });

  it('mute sets every gain to 0 and unmute restores the volumes from before', () => {
    const rig = unlockedRig({ muted: false, musicVolume: 0.3, sfxVolume: 0.6 });
    rig.manager.play('place');
    const bus = effectsBus(rig);
    rig.manager.startChug(2);
    const level = chugLevel(rig, bus);

    rig.manager.apply({ muted: true, musicVolume: 0.3, sfxVolume: 0.6 });
    expect(lastValue(bus.gain)).toBe(0);
    expect(lastValue(level.gain)).toBe(0);
    expect(rig.music.setVolume).toHaveBeenLastCalledWith(0);
    expect(rig.manager.settings).toEqual({ muted: true, musicVolume: 0.3, sfxVolume: 0.6 });

    // While muted, one-shots are logged but build nothing.
    const before = rig.fake.nodes.length;
    rig.manager.play('snap');
    expect(rig.fake.nodes.length).toBe(before);
    expect(rig.manager.getLog().at(-1)).toBe('snap');

    rig.manager.apply({ muted: false, musicVolume: 0.3, sfxVolume: 0.6 });
    expect(lastValue(bus.gain)).toBeCloseTo(0.6);
    expect(lastValue(level.gain)).toBeCloseTo(0.6);
    expect(rig.music.setVolume).toHaveBeenLastCalledWith(0.3);
  });

  it('a chug started while muted runs at 0 and becomes audible on unmute', () => {
    const rig = unlockedRig({ muted: true, musicVolume: 0.5, sfxVolume: 0.8 });
    rig.manager.startChug(2);
    expect(loopSources(rig)).toHaveLength(1);
    const level = chugLevel(rig, null);
    expect(lastValue(level.gain)).toBe(0);

    rig.manager.apply(DEFAULTS);
    expect(lastValue(level.gain)).toBeCloseTo(0.8);
  });
});

// ---------------------------------------------------------------------------
// Chug logging (Requirement 26.2)
// ---------------------------------------------------------------------------

describe('chug', () => {
  it('logs chug exactly once per start; level updates and stops log nothing', () => {
    const rig = unlockedRig();
    rig.manager.startChug(0.5);
    for (let i = 0; i < 30; i++) rig.manager.setChugLevel(0.5 + i * 0.05);
    rig.manager.stopChug();
    rig.manager.stopChug();
    rig.manager.startChug(1);
    rig.manager.setChugLevel(1.5);
    rig.manager.stopChug();

    expect(rig.manager.getLog()).toEqual(['chug', 'chug']);
  });

  it('runs one loop at a time and stops it on stopChug', () => {
    const rig = unlockedRig();
    rig.manager.startChug(1);
    rig.manager.startChug(1.5);
    const [first, second] = loopSources(rig);
    expect(loopSources(rig)).toHaveLength(2);
    expect(first!.stopped).not.toBeNull();
    expect(second!.stopped).toBeNull();

    rig.manager.stopChug();
    expect(second!.stopped).not.toBeNull();
    expect(second!.stopped! - rig.fake.currentTime).toBeLessThanOrEqual(0.1);
  });
});

// ---------------------------------------------------------------------------
// File sounds
// ---------------------------------------------------------------------------

describe('file sounds', () => {
  const bank = SOUND_BANK as Record<SoundEvent, SoundSource>;
  const original = { ...SOUND_BANK };

  beforeEach(() => {
    bank.place = { kind: 'file', src: ['/assets/audio/sfx/place.ogg', '/assets/audio/sfx/place.mp3'], fallback: 'woodKnock' };
    bank.delete = { kind: 'file', src: ['/assets/audio/sfx/delete.ogg'], fallback: 'woodKnockDown' };
  });

  afterEach(() => {
    Object.assign(bank, original);
  });

  function howlFor(src: string) {
    const howl = fakes.howls.find((h) => h.options.src[0] === src);
    if (!howl) throw new Error(`no Howl for ${src}`);
    return howl;
  }

  it('preloads each file entry once as a decoded Web Audio buffer', () => {
    const rig = makeRig();
    rig.manager.install(rig.target);
    rig.manager.install(rig.target);

    const fileEntries = Object.values(SOUND_BANK).filter((s) => s.kind === 'file');
    expect(fileEntries.length).toBeGreaterThanOrEqual(2);
    expect(fakes.howls).toHaveLength(fileEntries.length);
    const place = howlFor('/assets/audio/sfx/place.ogg');
    expect(place.options).toMatchObject({
      src: ['/assets/audio/sfx/place.ogg', '/assets/audio/sfx/place.mp3'],
      html5: false,
      preload: true,
      volume: 0.8,
    });
    expect(howlFor('/assets/audio/sfx/delete.ogg').options.html5).toBe(false);
  });

  it('plays a loaded file, and uses the synth fallback while it is still loading', () => {
    const rig = unlockedRig();
    const place = howlFor('/assets/audio/sfx/place.ogg');

    rig.manager.play('place');
    expect(place.plays).toBe(0);
    const synthNodes = soundNodes(rig).length;
    expect(synthNodes).toBeGreaterThan(0);

    place.loadState = 'loaded';
    rig.manager.play('place');
    expect(place.plays).toBe(1);
    expect(soundNodes(rig).length).toBe(synthNodes);
    expect(rig.manager.getLog()).toEqual(['place', 'place']);

    // Volume changes reach the file sounds too; muting skips them.
    rig.manager.apply({ muted: false, musicVolume: 0.5, sfxVolume: 0.25 });
    expect(place.vol).toBe(0.25);
    rig.manager.apply({ muted: true, musicVolume: 0.5, sfxVolume: 0.25 });
    expect(place.vol).toBe(0);
    rig.manager.play('place');
    expect(place.plays).toBe(1);
  });

  it('falls back to synthesis with one warning when a file fails to load', () => {
    const rig = unlockedRig();
    const del = howlFor('/assets/audio/sfx/delete.ogg');

    del.options.onloaderror?.(1, 'decode error');
    del.options.onloaderror?.(1, 'decode error');
    expect(rig.warn).toHaveBeenCalledTimes(1);
    expect(String(rig.warn.mock.calls[0]![0])).toContain('delete');
    expect(del.unloads).toBe(1);

    del.loadState = 'loaded'; // Even if the Howl later reports loaded, it is not used.
    rig.manager.play('delete');
    expect(del.plays).toBe(0);
    expect(rig.fake.sources().length).toBeGreaterThan(0);

    // A failed file is no longer updated on volume changes.
    const volumeCalls = del.volumes.length;
    rig.manager.apply({ muted: false, musicVolume: 0.5, sfxVolume: 0.3 });
    expect(del.volumes.length).toBe(volumeCalls);
  });

  it('scales a file Howl by its mix trim, at creation and on volume changes', () => {
    bank.ui = { kind: 'file', src: ['/assets/audio/sfx/ui-click.ogg'], fallback: 'uiClick', gain: 0.5 };
    const rig = unlockedRig();
    const ui = howlFor('/assets/audio/sfx/ui-click.ogg');
    expect(ui.options.volume).toBeCloseTo(0.8 * 0.5);

    rig.manager.apply({ muted: false, musicVolume: 0.5, sfxVolume: 0.6 });
    expect(ui.vol).toBeCloseTo(0.6 * 0.5);
    rig.manager.apply({ muted: true, musicVolume: 0.5, sfxVolume: 0.6 });
    expect(ui.vol).toBe(0);
    rig.manager.apply({ muted: false, musicVolume: 0.5, sfxVolume: 0.6 });
    expect(ui.vol).toBeCloseTo(0.6 * 0.5);
  });
});

// ---------------------------------------------------------------------------
// tone only through dynamic import (Requirement 1.7)
// ---------------------------------------------------------------------------

describe('tone loading', () => {
  const audioDir = resolve(process.cwd(), 'src/audio');
  const sources = readdirSync(audioDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: readFileSync(join(audioDir, f), 'utf8') }));

  it('no audio module imports tone statically, and music.ts uses import("tone")', () => {
    expect(sources.length).toBeGreaterThan(0);
    const staticImport = /^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s*['"]tone['"]|^\s*import\s*['"]tone['"]/m;
    for (const { file, text } of sources) expect(staticImport.test(text), file).toBe(false);
    const music = sources.find((s) => s.file === 'music.ts')!;
    expect(music.text).toMatch(/import\(\s*['"]tone['"]\s*\)/);
  });

  it('loads tone only when generated music starts after the unlock', async () => {
    // Importing the audio manager did not load tone.
    expect(fakes.tone.loads).toBe(0);

    const fake = new FakeContext();
    fakes.howler.ctx = fake;
    fakes.howler.masterGain = new FakeGain(fake);
    const warn = vi.fn();
    // Default music: no music file is configured, so the tone fallback is used.
    const manager = createAudioManager({ warn });
    manager.install(new EventTarget());
    manager.play('ui');
    manager.apply({ muted: false, musicVolume: 0.2, sfxVolume: 0.8 });
    await Promise.resolve();
    expect(fakes.tone.loads).toBe(0);

    manager.unlock();
    await vi.waitFor(() => expect(fakes.tone.loads).toBe(1));
    // The fake tone cannot build the song, so music stays silent with a warning, not an error.
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(String(warn.mock.calls[0]![0])).toMatch(/^Music is off/);
  });
});
