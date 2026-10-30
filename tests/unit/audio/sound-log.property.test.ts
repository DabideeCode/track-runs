/**
 * Property test for the sound log of the AudioManager (`src/audio/AudioManager.ts`).
 *
 * Runs in Node with injected fakes: a `HowlerLike` that returns a minimal fake
 * AudioContext (or null) and a fake master gain, a recording Howl factory, a
 * fake `MusicController` and a real Node `EventTarget` for the unlock gesture.
 *
 * Requirements: 25.12, 27.5, 39.15
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  SOUND_LOG_LIMIT,
  createAudioManager,
  type HowlFactoryOptions,
  type HowlLike,
  type HowlerLike,
} from '@/audio/AudioManager';
import type { MusicController, MusicSource } from '@/audio/music';
import type { OneShotEvent } from '@/audio/types';
import type { AudioSettings, SoundEvent } from '@/domain/types';

// ---------------------------------------------------------------------------
// Event names
// ---------------------------------------------------------------------------

/** Every sound event name; the Record type makes the compiler enforce completeness. */
const ALL_EVENTS_RECORD: Record<SoundEvent, true> = {
  pickup: true,
  place: true,
  move: true,
  rotate: true,
  delete: true,
  snap: true,
  invalid: true,
  ui: true,
  whistle: true,
  chug: true,
  bump: true,
};
const ALL_EVENTS = Object.keys(ALL_EVENTS_RECORD) as SoundEvent[];
const ONE_SHOT_EVENTS = ALL_EVENTS.filter((e): e is OneShotEvent => e !== 'chug');

// ---------------------------------------------------------------------------
// Minimal fake Web Audio that counts created nodes and started sources
// ---------------------------------------------------------------------------

class FakeParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) throw new RangeError('exponential ramp target must be > 0');
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  readonly context: FakeContext;
  constructor(ctx: FakeContext, register = true) {
    this.context = ctx;
    if (register) ctx.created++;
  }
  connect<T>(target: T): T {
    return target;
  }
  disconnect() {}
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeSource extends FakeNode {
  onended: ((ev: Event) => void) | null = null;
  start() {
    this.context.started++;
  }
  stop() {}
}

class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
  readonly playbackRate = new FakeParam();
}

class FakeConstantSource extends FakeSource {
  readonly offset = new FakeParam();
}

class FakeBuffer {
  private readonly data: Float32Array;
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = new Float32Array(length);
  }
  getChannelData() {
    return this.data;
  }
}

class FakeContext {
  /** Audio nodes created (sources, gains, filters). */
  created = 0;
  /** Source nodes started, i.e. sounds actually scheduled to play. */
  started = 0;
  resumes = 0;
  currentTime = 0;
  // A small sample rate keeps the shared noise and chug buffers cheap to render.
  readonly sampleRate = 240;
  state: 'suspended' | 'running' = 'suspended';
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
}

class FakeMusic implements MusicController {
  starts = 0;
  readonly volumes: number[] = [];
  start() {
    this.starts++;
    return Promise.resolve();
  }
  setVolume(v: number) {
    this.volumes.push(v);
  }
  stop() {}
  get source(): MusicSource {
    return 'none';
  }
}

interface Rig {
  manager: ReturnType<typeof createAudioManager>;
  ctx: FakeContext | null;
  music: FakeMusic;
  target: EventTarget;
  howls: HowlFactoryOptions[];
  /** Plays of file sounds (fake Howls report `loaded`, so files are used when present). */
  howlPlays: { count: number };
  warnings: string[];
}

function makeRig(withContext: boolean, settings: AudioSettings): Rig {
  const ctx = withContext ? new FakeContext() : null;
  // The master gain stands for Howler.masterGain and is not counted as a created node.
  const master = ctx ? new FakeNode(ctx, false) : null;
  const howler: HowlerLike = {
    getContext: () => ctx as unknown as AudioContext | null,
    getMasterGain: () => master as unknown as AudioNode | null,
  };
  const howls: HowlFactoryOptions[] = [];
  const howlPlays = { count: 0 };
  const createHowl = (options: HowlFactoryOptions): HowlLike => {
    howls.push(options);
    return {
      play: () => ++howlPlays.count,
      volume: () => 0,
      state: () => 'loaded',
      unload: () => {},
    };
  };
  const music = new FakeMusic();
  const warnings: string[] = [];
  const manager = createAudioManager({
    howler,
    createHowl,
    music,
    settings,
    warn: (message) => warnings.push(message),
  });
  const target = new EventTarget();
  manager.install(target);
  return { manager, ctx, music, target, howls, howlPlays, warnings };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

type Command =
  | { kind: 'play'; event: OneShotEvent }
  | { kind: 'startChug'; speed: number | undefined }
  | { kind: 'setChugLevel'; speed: number }
  | { kind: 'stopChug' }
  | { kind: 'apply'; settings: AudioSettings }
  | { kind: 'unlock' }
  | { kind: 'gesture'; type: 'pointerdown' | 'keydown' };

const arbVolume = fc.double({ min: 0, max: 1, noNaN: true });
const arbSpeed = fc.double({ min: 0, max: 3, noNaN: true });
const arbSettings: fc.Arbitrary<AudioSettings> = fc.record({
  muted: fc.boolean(),
  musicVolume: arbVolume,
  sfxVolume: arbVolume,
});

const arbCommand: fc.Arbitrary<Command> = fc.oneof(
  { weight: 8, arbitrary: fc.constantFrom(...ONE_SHOT_EVENTS).map((event) => ({ kind: 'play', event }) as const) },
  { weight: 2, arbitrary: fc.option(arbSpeed, { nil: undefined }).map((speed) => ({ kind: 'startChug', speed }) as const) },
  { weight: 2, arbitrary: arbSpeed.map((speed) => ({ kind: 'setChugLevel', speed }) as const) },
  { weight: 1, arbitrary: fc.constant({ kind: 'stopChug' } as const) },
  { weight: 3, arbitrary: arbSettings.map((settings) => ({ kind: 'apply', settings }) as const) },
  { weight: 1, arbitrary: fc.constant({ kind: 'unlock' } as const) },
  {
    weight: 1,
    arbitrary: fc.constantFrom('pointerdown', 'keydown').map((type) => ({ kind: 'gesture', type }) as const),
  },
);

function run(rig: Rig, cmd: Command): void {
  const m = rig.manager;
  switch (cmd.kind) {
    case 'play':
      m.play(cmd.event);
      break;
    case 'startChug':
      if (cmd.speed === undefined) m.startChug();
      else m.startChug(cmd.speed);
      break;
    case 'setChugLevel':
      m.setChugLevel(cmd.speed);
      break;
    case 'stopChug':
      m.stopChug();
      break;
    case 'apply':
      m.apply(cmd.settings);
      break;
    case 'unlock':
      m.unlock();
      break;
    case 'gesture':
      rig.target.dispatchEvent(new Event(cmd.type));
      break;
  }
}

// ---------------------------------------------------------------------------
// Property 35
// ---------------------------------------------------------------------------

describe('AudioManager sound log', () => {
  // Feature: track-diorama-builder, Property 35: The sound log ignores mute and unlock state
  it('logs every triggered event in order regardless of mute and unlock, and plays nothing deferred', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        arbSettings,
        fc.array(arbCommand, { maxLength: 60 }),
        (withContext, initial, commands) => {
          const rig = makeRig(withContext, initial);
          const expected: SoundEvent[] = [];
          let unlocked = false;
          let muted = initial.muted;

          for (const cmd of commands) {
            const createdBefore = rig.ctx?.created ?? 0;
            const startedBefore = rig.ctx?.started ?? 0;
            const howlPlaysBefore = rig.howlPlays.count;
            const wasUnlocked = unlocked;

            run(rig, cmd);

            // Model.
            if (cmd.kind === 'play') expected.push(cmd.event);
            if (cmd.kind === 'startChug') expected.push('chug');
            if (cmd.kind === 'apply') muted = cmd.settings.muted;
            if (cmd.kind === 'unlock' || cmd.kind === 'gesture') unlocked = true;

            // The log is exactly the triggered events, in call order, only allowed names.
            const log = rig.manager.getLog();
            expect(log).toEqual(expected);
            for (const name of log) expect(ALL_EVENTS).toContain(name);
            expect(rig.manager.unlocked).toBe(unlocked);

            // getLog returns a copy: mutating it does not affect the next call.
            log.push('bump');
            log.reverse();
            log.length = Math.min(log.length, 1);
            expect(rig.manager.getLog()).toEqual(expected);

            const filePlays = rig.howlPlays.count - howlPlaysBefore;
            // A file sound never plays before the unlock or while muted, with or without a context.
            if (!wasUnlocked || muted) expect(filePlays).toBe(0);

            if (!rig.ctx) continue;
            const created = rig.ctx.created - createdBefore;
            // Sounds actually played: synthesised sources started, plus file plays.
            const started = rig.ctx.started - startedBefore + filePlays;

            if (!wasUnlocked) {
              // Before the unlock nothing is created or played, and the unlock
              // itself plays nothing that was triggered earlier.
              expect(created).toBe(0);
              expect(started).toBe(0);
              continue;
            }

            // After the unlock, audibility depends on mute, but the log did not.
            if (cmd.kind === 'play') {
              if (muted) expect(started).toBe(0);
              else expect(started).toBeGreaterThan(0);
            } else if (cmd.kind === 'startChug') {
              // D-33: the chug loop runs (at gain 0 when muted).
              expect(started).toBeGreaterThan(0);
            } else {
              expect(started).toBe(0);
            }
          }

          // Music starts at most once, and only after an unlock.
          expect(rig.music.starts).toBe(unlocked ? 1 : 0);
          if (rig.ctx) expect(rig.ctx.resumes).toBe(unlocked ? 1 : 0);
          // Each file sound was preloaded once at install, whatever happened afterwards.
          const fileSrcs = rig.howls.map((h) => h.src[0]);
          expect(new Set(fileSrcs).size).toBe(fileSrcs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: track-diorama-builder, Property 35: The sound log ignores mute and unlock state
  it(`keeps only the newest ${SOUND_LOG_LIMIT} entries`, () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 150 }),
        fc.array(fc.constantFrom<'chug' | OneShotEvent>('chug', ...ONE_SHOT_EVENTS), {
          minLength: 1,
          maxLength: 50,
        }),
        fc.boolean(),
        (overflow, tail, unlockFirst) => {
          const rig = makeRig(false, { muted: false, musicVolume: 0.5, sfxVolume: 0.8 });
          if (unlockFirst) rig.manager.unlock();
          const fillerCount = SOUND_LOG_LIMIT + overflow - tail.length;
          const all: SoundEvent[] = [];
          for (let i = 0; i < fillerCount; i++) all.push(ONE_SHOT_EVENTS[i % ONE_SHOT_EVENTS.length]!);
          all.push(...tail);

          for (const e of all) {
            if (e === 'chug') rig.manager.startChug(1);
            else rig.manager.play(e);
          }

          const log = rig.manager.getLog();
          expect(log).toHaveLength(SOUND_LOG_LIMIT);
          expect(log).toEqual(all.slice(all.length - SOUND_LOG_LIMIT));
          expect(log.slice(log.length - tail.length)).toEqual(tail);
        },
      ),
      { numRuns: 100 },
    );
  });
});
