/**
 * Unit tests for the Web Audio recipes (`src/audio/synth.ts`) and the sound
 * bank (`src/audio/soundBank.ts`), run in Node against a minimal fake
 * AudioContext that records created nodes, connections and scheduled values.
 *
 * Requirements: 25.8, 25.9, 34.5, 34.6, 34.11
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUND_BANK, fileGainOf, resolveSynth, sfxUrl, synthRecipeNameFor } from '@/audio/soundBank';
import {
  CHUG_MAX_RATE,
  CHUG_MIN_RATE,
  ONE_SHOT_RECIPES,
  chugRateFor,
  getChugBuffer,
  getNoiseBuffer,
  startChugLoop,
  type OneShotRecipeName,
} from '@/audio/synth';
import type { SoundEvent } from '@/domain/types';

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
    // The real API throws for non-positive targets.
    if (!(value > 0)) throw new RangeError('exponential ramp target must be > 0');
    this.events.push({ kind: 'exp', value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number, _tc: number) {
    this.events.push({ kind: 'target', value, time });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events.push({ kind: 'cancel', value: NaN, time });
    return this;
  }
}

class FakeNode {
  readonly outputs = new Set<FakeNode | FakeParam>();
  disconnectCount = 0;
  readonly ctx: FakeContext;
  readonly kind: string;
  constructor(ctx: FakeContext, kind: string) {
    this.ctx = ctx;
    this.kind = kind;
    ctx.nodes.push(this);
  }
  connect(target: FakeNode | FakeParam) {
    this.outputs.add(target);
    return target;
  }
  disconnect() {
    this.outputs.clear();
    this.disconnectCount++;
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
  readonly nodes: FakeNode[] = [];
  buffersCreated = 0;
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
    this.buffersCreated++;
    return new FakeBuffer(channels, length, rate);
  }
  sources() {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }
  /** Fires `onended` on every started source, as the real context does after stop time. */
  finishAll() {
    for (const s of this.sources()) s.end();
  }
}

function setup() {
  const fake = new FakeContext();
  const destination = new FakeGain(fake);
  return {
    fake,
    destination,
    ctx: fake as unknown as BaseAudioContext,
    dest: destination as unknown as AudioNode,
  };
}

/** Nodes (excluding the destination) that still have outgoing connections. */
function connectedNodes(fake: FakeContext, destination: FakeNode) {
  return fake.nodes.filter((n) => n !== destination && n.outputs.size > 0);
}

/** True when there is a path of connections from `from` to `to`. */
function reaches(from: FakeNode, to: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  for (const out of from.outputs) {
    if (out instanceof FakeNode && reaches(out, to, seen)) return true;
  }
  return false;
}

const EVENTS: SoundEvent[] = [
  'pickup',
  'place',
  'move',
  'rotate',
  'delete',
  'snap',
  'invalid',
  'ui',
  'whistle',
  'chug',
  'bump',
];

// ---------------------------------------------------------------------------
// Sound bank
// ---------------------------------------------------------------------------

describe('sound bank', () => {
  it('has an entry for exactly the 11 sound events', () => {
    expect(Object.keys(SOUND_BANK).sort()).toEqual([...EVENTS].sort());
  });

  it('resolves every entry to a synth recipe function', () => {
    for (const event of EVENTS) {
      const r = resolveSynth(event);
      if (r.kind === 'loop') expect(typeof r.start).toBe('function');
      else expect(typeof r.play).toBe('function');
    }
    expect(resolveSynth('chug').kind).toBe('loop');
    for (const event of EVENTS.filter((e) => e !== 'chug')) {
      expect(resolveSynth(event).kind).toBe('oneShot');
    }
  });

  it('uses CC0 files for the build, ui and bump sounds and synthesis for whistle and chug', () => {
    const fileEvents = ['pickup', 'place', 'move', 'rotate', 'delete', 'snap', 'invalid', 'ui', 'bump'] as const;
    for (const event of fileEvents) expect(SOUND_BANK[event].kind, event).toBe('file');
    expect(SOUND_BANK.whistle).toEqual({ kind: 'synth', recipe: 'whistle' });
    expect(SOUND_BANK.chug).toEqual({ kind: 'synth', recipe: 'chug' });
  });

  it('points every file entry at an existing .ogg or .mp3 under public/assets/audio/sfx/', () => {
    const publicDir = resolve(process.cwd(), 'public');
    for (const event of EVENTS) {
      const source = SOUND_BANK[event];
      if (source.kind !== 'file') continue;
      expect(source.src.length, event).toBeGreaterThan(0);
      expect(source.src[0], event).toMatch(/\.ogg$/);
      for (const url of source.src) {
        expect(url, event).toMatch(/^\/assets\/audio\/sfx\/[a-z-]+\.(ogg|mp3)$/);
        expect(existsSync(join(publicDir, url)), url).toBe(true);
      }
    }
  });

  it('uses different files for every event, so place and delete never share a clip', () => {
    const firstSrc = EVENTS.flatMap((e) => {
      const s = SOUND_BANK[e];
      return s.kind === 'file' ? [s.src[0]!] : [];
    });
    expect(new Set(firstSrc).size).toBe(firstSrc.length);
    const place = SOUND_BANK.place;
    const del = SOUND_BANK.delete;
    expect(place.kind === 'file' && del.kind === 'file').toBe(true);
    if (place.kind === 'file' && del.kind === 'file') {
      const bytes = (s: typeof place) => readFileSync(join(process.cwd(), 'public', s.src[0]!));
      expect(bytes(place).equals(bytes(del))).toBe(false);
    }
  });

  it('keeps every mix trim within 0 to 1', () => {
    for (const event of EVENTS) {
      const trim = fileGainOf(SOUND_BANK[event]);
      expect(trim, event).toBeGreaterThan(0);
      expect(trim, event).toBeLessThanOrEqual(1);
    }
    expect(fileGainOf({ kind: 'synth', recipe: 'whistle' })).toBe(1);
    expect(fileGainOf({ kind: 'file', src: ['x.ogg'], fallback: 'woodKnock', gain: 3 })).toBe(1);
    expect(fileGainOf({ kind: 'file', src: ['x.ogg'], fallback: 'woodKnock', gain: -1 })).toBe(0);
    expect(fileGainOf({ kind: 'file', src: ['x.ogg'], fallback: 'woodKnock', gain: Number.NaN })).toBe(1);
  });

  it('builds file URLs from the base URL', () => {
    expect(sfxUrl('place.ogg')).toBe('/assets/audio/sfx/place.ogg');
  });

  it('gives place, delete and invalid different recipes', () => {
    const names = (['place', 'delete', 'invalid'] as const).map(synthRecipeNameFor);
    expect(new Set(names).size).toBe(3);
    const fns = (['place', 'delete', 'invalid'] as const).map((e) => {
      const r = resolveSynth(e);
      return r.kind === 'oneShot' ? r.play : r.start;
    });
    expect(new Set(fns).size).toBe(3);
  });

  it('gives every event its own recipe', () => {
    expect(new Set(EVENTS.map(synthRecipeNameFor)).size).toBe(EVENTS.length);
  });
});

// ---------------------------------------------------------------------------
// One-shot recipes
// ---------------------------------------------------------------------------

describe('one-shot recipes', () => {
  const names = Object.keys(ONE_SHOT_RECIPES) as OneShotRecipeName[];

  it.each(names)('%s connects to the destination and cleans up after it ends', (name) => {
    const { fake, destination, ctx, dest } = setup();
    fake.currentTime = 2;
    const { endTime } = ONE_SHOT_RECIPES[name](ctx, dest);

    const sources = fake.sources();
    expect(sources.length).toBeGreaterThan(0);
    // Every audible source reaches the destination.
    for (const s of sources) {
      if (s.kind !== 'constantSource' && !(s instanceof FakeOscillator && s.frequency.value < 20)) {
        expect(reaches(s, destination)).toBe(true);
      }
    }
    // Every source is started no earlier than now and stopped by endTime.
    for (const s of sources) {
      expect(s.started).not.toBeNull();
      expect(s.started!).toBeGreaterThanOrEqual(2);
      expect(s.stopped).not.toBeNull();
      expect(s.stopped!).toBeLessThanOrEqual(endTime + 1e-9);
    }
    // Soft timbres only: no square or sawtooth waves.
    for (const s of sources) {
      if (s instanceof FakeOscillator) expect(['sine', 'triangle']).toContain(s.type);
    }
    // Amplitude envelopes stay within 0 to 1 (modulation gains feeding an AudioParam are skipped).
    for (const n of fake.nodes) {
      const modulates = [...n.outputs].some((o) => o instanceof FakeParam);
      if (n instanceof FakeGain && n !== destination && !modulates) {
        for (const e of n.gain.events) if (Number.isFinite(e.value)) expect(e.value).toBeLessThanOrEqual(1);
      }
    }
    // Short one-shots (the whistle is the longest at under 1 s).
    expect(endTime - 2).toBeLessThan(1);

    fake.finishAll();
    expect(connectedNodes(fake, destination)).toEqual([]);
    expect(destination.disconnectCount).toBe(0);
  });

  it('starts at opts.when and applies opts.gain', () => {
    const { fake, ctx, dest } = setup();
    ONE_SHOT_RECIPES.woodKnock(ctx, dest, { when: 5, gain: 0.25 });
    for (const s of fake.sources()) expect(s.started!).toBeGreaterThanOrEqual(5);
    const out = fake.nodes.find((n): n is FakeGain => n instanceof FakeGain && n.gain.value === 0.25);
    expect(out).toBeDefined();
  });

  it('whistle uses two detuned sines near 1,100 and 1,320 Hz with vibrato', () => {
    const { fake, ctx, dest } = setup();
    ONE_SHOT_RECIPES.whistle(ctx, dest);
    const oscs = fake.nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
    const finals = oscs
      .map((o) => o.frequency.events.find((e) => e.kind === 'linear')?.value)
      .filter((v): v is number => v !== undefined)
      .sort((a, b) => a - b);
    expect(finals).toEqual([1100, 1320]);
    // The LFO's depth gain is connected to an oscillator frequency param.
    const depth = fake.nodes.find(
      (n) => n instanceof FakeGain && [...n.outputs].some((o) => o instanceof FakeParam),
    );
    expect(depth).toBeDefined();
  });

  it('shares one noise buffer per context', () => {
    const { fake, ctx, dest } = setup();
    ONE_SHOT_RECIPES.woodKnock(ctx, dest);
    ONE_SHOT_RECIPES.uiClick(ctx, dest);
    const buffers = new Set(
      fake.nodes.filter((n): n is FakeBufferSource => n instanceof FakeBufferSource).map((s) => s.buffer),
    );
    expect(buffers.size).toBe(1);
    expect(fake.buffersCreated).toBe(1);
    expect(getNoiseBuffer(ctx)).toBe(getNoiseBuffer(ctx));
    expect(getNoiseBuffer(setup().ctx)).not.toBe(getNoiseBuffer(ctx));
  });
});

// ---------------------------------------------------------------------------
// Chug loop
// ---------------------------------------------------------------------------

describe('chug loop', () => {
  it('maps speed to a clamped, non-decreasing playback rate', () => {
    expect(chugRateFor(1.5)).toBeCloseTo(1);
    expect(chugRateFor(0)).toBe(CHUG_MIN_RATE);
    expect(chugRateFor(-3)).toBe(CHUG_MIN_RATE);
    expect(chugRateFor(Number.NaN)).toBe(CHUG_MIN_RATE);
    expect(chugRateFor(100)).toBe(CHUG_MAX_RATE);
    expect(chugRateFor(2)).toBeGreaterThan(chugRateFor(1.5));
  });

  it('loops a cached pattern buffer into the destination', () => {
    const { fake, destination, ctx, dest } = setup();
    startChugLoop(ctx, dest, { speed: 1.5, level: 0.75 });
    const src = fake.nodes.find((n): n is FakeBufferSource => n instanceof FakeBufferSource)!;
    expect(src.loop).toBe(true);
    expect(src.started).toBe(0);
    expect(src.stopped).toBeNull();
    expect(src.buffer).toBe(getChugBuffer(ctx) as unknown as FakeBuffer);
    expect(src.playbackRate.value).toBeCloseTo(1);
    expect(reaches(src, destination)).toBe(true);
    const data = src.buffer!.getChannelData(0);
    const peak = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(0.6 + 1e-6);
  });

  it('setRate and setLevel schedule smoothed changes; stop disconnects everything', () => {
    const { fake, destination, ctx, dest } = setup();
    const handle = startChugLoop(ctx, dest);
    const src = fake.nodes.find((n): n is FakeBufferSource => n instanceof FakeBufferSource)!;
    const level = fake.nodes.find((n): n is FakeGain => n instanceof FakeGain && n !== destination)!;

    fake.currentTime = 1;
    handle.setRate(2);
    expect(src.playbackRate.events.at(-1)).toMatchObject({ kind: 'target', value: chugRateFor(2), time: 1 });
    handle.setLevel(0.5);
    expect(level.gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0.5, time: 1 });
    handle.setLevel(7);
    expect(level.gain.events.at(-1)!.value).toBe(1);

    fake.currentTime = 2;
    handle.stop();
    expect(src.stopped).not.toBeNull();
    expect(src.stopped! - 2).toBeLessThanOrEqual(0.1);
    expect(level.gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 });

    fake.finishAll();
    expect(connectedNodes(fake, destination)).toEqual([]);
    expect(destination.disconnectCount).toBe(0);

    // Idempotent, and setters after stop do nothing.
    const stopAt = src.stopped;
    const count = src.playbackRate.events.length;
    handle.stop();
    handle.setRate(1);
    handle.setLevel(0.3);
    expect(src.stopped).toBe(stopAt);
    expect(src.playbackRate.events.length).toBe(count);
  });
});
