/**
 * Web Audio synthesis recipes for the sound effects (Requirement 34.11 fallback).
 *
 * Every recipe takes `(ctx, destination, opts?)` and builds a short node graph
 * that ends in `destination`. The AudioManager (task 9.2) passes the effects
 * gain node that is chained to `Howler.masterGain`, so mute and volume apply to
 * synthesised and file-based sounds alike. This module does not import howler,
 * so it runs in Node tests with a fake context.
 *
 * Sound design: soft wooden-toy sounds. Only sine and triangle oscillators and
 * band-limited noise are used (no square or sawtooth waves), every envelope is
 * short and starts and ends near silence, and the peak sum of each recipe stays
 * below 0.9 so nothing clips. Every source node disconnects its chain when it
 * ends, so finished sounds leave no nodes connected.
 *
 * Place, delete and invalid use different recipes (Requirement 25.8):
 * place is a bright knock with a soft thud, delete is a lower descending
 * double knock, invalid is a dull low double thunk.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Names of the one-shot recipes. */
export type OneShotRecipeName =
  | 'liftSwish'
  | 'woodKnock'
  | 'woodSlide'
  | 'woodTick'
  | 'woodKnockDown'
  | 'woodClack'
  | 'dullThunk'
  | 'uiClick'
  | 'whistle'
  | 'softBump';

/** Name of the looping chug recipe. */
export type LoopRecipeName = 'chug';

export type SynthRecipeName = OneShotRecipeName | LoopRecipeName;

export interface OneShotOptions {
  /** Context time at which the sound starts. Defaults to `ctx.currentTime`. */
  when?: number;
  /** Linear gain multiplier applied to the whole recipe. Defaults to 1. */
  gain?: number;
}

export interface OneShotResult {
  /** Context time after which every node of the sound has stopped. */
  endTime: number;
}

export type OneShotRecipe = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  opts?: OneShotOptions,
) => OneShotResult;

export interface ChugOptions {
  /** Initial train speed in tiles per second. Defaults to 0. */
  speed?: number;
  /** Initial linear output level, 0 to 1. Defaults to 0. */
  level?: number;
}

export interface ChugHandle {
  /** Sets the chug rate from the train speed (tiles per second). */
  setRate(speed: number): void;
  /** Sets the linear output level (the AudioManager passes speed / 2). */
  setLevel(gain: number): void;
  /** Fades out within 50 ms, stops the loop and disconnects its nodes. Idempotent. */
  stop(): void;
}

export type LoopRecipe = (
  ctx: BaseAudioContext,
  destination: AudioNode,
  opts?: ChugOptions,
) => ChugHandle;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Smallest value used for exponential ramps (they cannot reach 0). */
const SILENT = 0.0001;

/** Extra time after an envelope ends before its source is stopped. */
const TAIL = 0.02;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * One second of white noise, created once per context and shared by every
 * recipe. A seeded generator keeps the noise identical between runs.
 */
export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx);
  if (cached) return cached;
  const length = Math.max(1, Math.round(ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b1d3;
  for (let i = 0; i < length; i++) {
    // xorshift32
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBuffers.set(ctx, buffer);
  return buffer;
}

/**
 * Connects `source → nodes… → destination` and, when `source` ends,
 * disconnects the source and its own `nodes`. The destination is shared and is
 * never disconnected here.
 */
function wire(source: AudioScheduledSourceNode, nodes: AudioNode[], destination: AudioNode): void {
  let prev: AudioNode = source;
  for (const node of nodes) {
    prev.connect(node);
    prev = node;
  }
  prev.connect(destination);
  source.onended = () => {
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
}

/** Gain node with a percussive envelope: rise to `peak` in `attack`, decay to silence by `at + duration`. */
function envelope(
  ctx: BaseAudioContext,
  at: number,
  peak: number,
  attack: number,
  duration: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENT, at);
  g.gain.linearRampToValueAtTime(Math.max(peak, SILENT), at + attack);
  g.gain.exponentialRampToValueAtTime(SILENT, at + duration);
  return g;
}

interface NoiseBurst {
  at: number;
  /** Band-pass centre frequency in Hz. */
  freq: number;
  q: number;
  duration: number;
  peak: number;
  attack?: number;
  /** Filter type; band-pass by default. */
  filter?: BiquadFilterType;
}

/** Band-limited noise burst: noise → filter → envelope → destination. Returns its end time. */
function noiseBurst(ctx: BaseAudioContext, dest: AudioNode, b: NoiseBurst): number {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = b.filter ?? 'bandpass';
  filter.frequency.setValueAtTime(b.freq, b.at);
  filter.Q.setValueAtTime(b.q, b.at);
  const env = envelope(ctx, b.at, b.peak, b.attack ?? 0.002, b.duration);
  wire(src, [filter, env], dest);
  // Start at a varying offset so repeated bursts do not sound identical.
  const offset = (b.freq * 0.000731) % 0.5;
  const end = b.at + b.duration + TAIL;
  src.start(b.at, offset);
  src.stop(end);
  return end;
}

interface Partial {
  at: number;
  type?: 'sine' | 'triangle';
  freq: number;
  /** Frequency at the end of the sound (exponential glide). Defaults to `freq`. */
  freqEnd?: number;
  duration: number;
  peak: number;
  attack?: number;
}

/** Pitched partial: oscillator → envelope → destination. Returns its end time. */
function partial(ctx: BaseAudioContext, dest: AudioNode, p: Partial): number {
  const osc = ctx.createOscillator();
  osc.type = p.type ?? 'sine';
  osc.frequency.setValueAtTime(p.freq, p.at);
  if (p.freqEnd !== undefined && p.freqEnd !== p.freq) {
    osc.frequency.exponentialRampToValueAtTime(p.freqEnd, p.at + p.duration);
  }
  const env = envelope(ctx, p.at, p.peak, p.attack ?? 0.003, p.duration);
  wire(osc, [env], dest);
  const end = p.at + p.duration + TAIL;
  osc.start(p.at);
  osc.stop(end);
  return end;
}

/**
 * Per-call output gain node that applies `opts.gain` and disconnects itself
 * after `endTime`. Returns the node recipes connect to.
 */
function outputStage(
  ctx: BaseAudioContext,
  destination: AudioNode,
  opts: OneShotOptions | undefined,
  build: (out: AudioNode, at: number) => number[],
): OneShotResult {
  const at = opts?.when ?? ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = clamp(opts?.gain ?? 1, 0, 1);
  out.connect(destination);
  const ends = build(out, at);
  const endTime = Math.max(at, ...ends);
  // A silent "timer" source releases the output stage once everything has ended.
  const timer = ctx.createConstantSource();
  timer.offset.value = 0;
  timer.connect(out);
  timer.onended = () => {
    timer.disconnect();
    out.disconnect();
  };
  timer.start(at);
  timer.stop(endTime + TAIL);
  return { endTime: endTime + TAIL };
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// One-shot recipes
// ---------------------------------------------------------------------------

/** Pickup: a soft upward lift with a light felt rustle. */
const liftSwish: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    partial(ctx, out, { at, freq: 420, freqEnd: 660, duration: 0.11, peak: 0.16, attack: 0.02 }),
    noiseBurst(ctx, out, { at, freq: 1300, q: 2.5, duration: 0.09, peak: 0.12, attack: 0.025 }),
  ]);

/** Place: a bright wood knock (band-pass noise + sine partial) and a soft thud. */
const woodKnock: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    noiseBurst(ctx, out, { at, freq: 1600, q: 8, duration: 0.09, peak: 0.45 }),
    partial(ctx, out, { at, freq: 820, freqEnd: 760, duration: 0.12, peak: 0.28 }),
    partial(ctx, out, { at: at + 0.004, freq: 180, freqEnd: 120, duration: 0.07, peak: 0.16 }),
  ]);

/** Move: a mid knock with a short wooden scrape before it. */
const woodSlide: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    noiseBurst(ctx, out, { at, freq: 700, q: 1.5, duration: 0.06, peak: 0.1, attack: 0.02 }),
    noiseBurst(ctx, out, { at: at + 0.035, freq: 1150, q: 7, duration: 0.085, peak: 0.38 }),
    partial(ctx, out, { at: at + 0.035, freq: 560, freqEnd: 520, duration: 0.1, peak: 0.24 }),
  ]);

/** Rotate: a single light wood-on-wood tick. */
const woodTick: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    noiseBurst(ctx, out, { at, freq: 1900, q: 9, duration: 0.05, peak: 0.36 }),
    partial(ctx, out, { at, type: 'triangle', freq: 1040, duration: 0.045, peak: 0.12 }),
  ]);

/** Delete: two knocks falling in pitch, lower than the place knock. */
const woodKnockDown: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    noiseBurst(ctx, out, { at, freq: 900, q: 6, duration: 0.08, peak: 0.32 }),
    partial(ctx, out, { at, freq: 520, freqEnd: 330, duration: 0.14, peak: 0.24 }),
    noiseBurst(ctx, out, { at: at + 0.075, freq: 620, q: 5, duration: 0.09, peak: 0.26 }),
    partial(ctx, out, { at: at + 0.075, freq: 340, freqEnd: 200, duration: 0.16, peak: 0.2 }),
  ]);

/** Snap: a quick double clack, two pegs seating together. */
const woodClack: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    noiseBurst(ctx, out, { at, freq: 2400, q: 10, duration: 0.035, peak: 0.34 }),
    partial(ctx, out, { at, freq: 1250, duration: 0.05, peak: 0.14 }),
    noiseBurst(ctx, out, { at: at + 0.045, freq: 2200, q: 10, duration: 0.04, peak: 0.3 }),
    partial(ctx, out, { at: at + 0.045, freq: 1180, duration: 0.055, peak: 0.12 }),
  ]);

/** Invalid: a dull, low double thunk through a low-pass, never harsh. */
const dullThunk: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => {
    const ends: number[] = [];
    for (const t of [at, at + 0.11]) {
      ends.push(
        partial(ctx, out, { at: t, type: 'triangle', freq: 150, freqEnd: 115, duration: 0.09, peak: 0.32, attack: 0.004 }),
        noiseBurst(ctx, out, { at: t, freq: 320, q: 1.2, duration: 0.06, peak: 0.14, filter: 'lowpass' }),
      );
    }
    return ends;
  });

/** UI click: a tiny, high, quiet click. */
const uiClick: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    noiseBurst(ctx, out, { at, freq: 3000, q: 12, duration: 0.025, peak: 0.22 }),
    partial(ctx, out, { at, freq: 1500, duration: 0.03, peak: 0.08 }),
  ]);

/** Whistle: two detuned sines (about 1,100 and 1,320 Hz) with a slow attack, vibrato and breath. */
const whistle: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => {
    const attack = 0.08;
    const hold = 0.45;
    const release = 0.3;
    const end = at + attack + hold + release;
    const stopAt = end + TAIL;

    // Soften the top end so the whistle stays warm.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.setValueAtTime(3500, at);
    const env = ctx.createGain();
    env.gain.setValueAtTime(SILENT, at);
    env.gain.linearRampToValueAtTime(0.32, at + attack);
    env.gain.setValueAtTime(0.32, at + attack + hold);
    env.gain.exponentialRampToValueAtTime(SILENT, end);
    tone.connect(env);
    env.connect(out);

    // Vibrato: a 5.5 Hz LFO modulating both oscillator frequencies by ±12 Hz.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.5, at);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(12, at);
    lfo.connect(depth);
    lfo.onended = () => {
      lfo.disconnect();
      depth.disconnect();
    };

    const oscs = [1100, 1320].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 0.97, at);
      osc.frequency.linearRampToValueAtTime(freq, at + attack);
      osc.detune.setValueAtTime(freq === 1100 ? -6 : 6, at);
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      depth.connect(osc.frequency);
      wire(osc, [mix], tone);
      return osc;
    });
    // The filter and envelope are shared; release them with the last oscillator.
    const last = oscs[oscs.length - 1]!;
    const lastEnded = last.onended;
    last.onended = function (this: AudioScheduledSourceNode, ev: Event) {
      lastEnded?.call(this, ev);
      tone.disconnect();
      env.disconnect();
    };

    lfo.start(at);
    lfo.stop(stopAt);
    for (const osc of oscs) {
      osc.start(at);
      osc.stop(stopAt);
    }
    const breath = noiseBurst(ctx, out, {
      at,
      freq: 2600,
      q: 1,
      duration: attack + hold + release,
      peak: 0.05,
      attack,
    });
    return [stopAt, breath];
  });

/** Bump: a soft low damped sine (about 120 Hz) with a little noise. */
const softBump: OneShotRecipe = (ctx, destination, opts) =>
  outputStage(ctx, destination, opts, (out, at) => [
    partial(ctx, out, { at, freq: 120, freqEnd: 85, duration: 0.25, peak: 0.42, attack: 0.006 }),
    noiseBurst(ctx, out, { at, freq: 420, q: 1, duration: 0.07, peak: 0.14 }),
  ]);

export const ONE_SHOT_RECIPES: Readonly<Record<OneShotRecipeName, OneShotRecipe>> = {
  liftSwish,
  woodKnock,
  woodSlide,
  woodTick,
  woodKnockDown,
  woodClack,
  dullThunk,
  uiClick,
  whistle,
  softBump,
};

// ---------------------------------------------------------------------------
// Chug loop
// ---------------------------------------------------------------------------

/** Train speed (tiles per second) at which the pattern plays at playbackRate 1. */
export const CHUG_BASE_SPEED = 1.5;
/** Beats in one loop of the pattern. */
export const CHUG_BEATS = 4;
/** Beats per tile travelled, so 6 beats per second at the base speed. */
export const CHUG_BEATS_PER_TILE = 4;
/** playbackRate limits; the level is near 0 at low speed anyway. */
export const CHUG_MIN_RATE = 0.4;
export const CHUG_MAX_RATE = 1.4;

/** playbackRate for a train speed; proportional to speed, clamped. */
export function chugRateFor(speed: number): number {
  return clamp(clamp(speed, 0, Infinity) / CHUG_BASE_SPEED, CHUG_MIN_RATE, CHUG_MAX_RATE);
}

const chugBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * Renders the 4-beat chug pattern once per context: band-limited noise puffs
 * with accents 1, 0.55, 0.75, 0.55 and a short exponential decay, plus a faint
 * low "puff" sine. Looping it with `playbackRate` gives a drift-free tempo.
 */
export function getChugBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = chugBuffers.get(ctx);
  if (cached) return cached;
  const rate = ctx.sampleRate;
  const beatSeconds = 1 / (CHUG_BEATS_PER_TILE * CHUG_BASE_SPEED);
  const beatLength = Math.max(1, Math.round(beatSeconds * rate));
  const length = beatLength * CHUG_BEATS;
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const noise = getNoiseBuffer(ctx).getChannelData(0);
  const accents = [1, 0.55, 0.75, 0.55];

  // Two one-pole low-passes; their difference is a soft band-pass (~250 to 1,800 Hz).
  const coef = (fc: number) => 1 - Math.exp((-2 * Math.PI * fc) / rate);
  const aLow = coef(250);
  const aHigh = coef(1800);
  let lpLow = 0;
  let lpHigh = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const beat = Math.floor(i / beatLength);
    const t = (i - beat * beatLength) / rate; // seconds into the beat
    const env = (t < 0.003 ? t / 0.003 : 1) * Math.exp(-t / 0.028) * accents[beat % CHUG_BEATS]!;
    const n = noise[i % noise.length]!;
    lpLow += aLow * (n - lpLow);
    lpHigh += aHigh * (n - lpHigh);
    const band = lpHigh - lpLow;
    const puff = Math.sin(2 * Math.PI * 95 * t) * Math.exp(-t / 0.04) * 0.35;
    const v = env * (band * 3 + puff);
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  // Normalise to 0.6 peak; fade the loop's last samples so the seam does not click.
  const scale = peak > 0 ? 0.6 / peak : 0;
  const fade = Math.min(64, length);
  for (let i = 0; i < length; i++) {
    const edge = i >= length - fade ? (length - i) / fade : 1;
    data[i] = data[i]! * scale * edge;
  }
  chugBuffers.set(ctx, buffer);
  return buffer;
}

/** Smoothing time constant for level and rate changes (well under 100 ms). */
const SMOOTH = 0.03;

/** Looping chug: buffer loop → warm low-pass → level gain → destination. */
export const startChugLoop: LoopRecipe = (ctx, destination, opts) => {
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = getChugBuffer(ctx);
  src.loop = true;
  src.playbackRate.setValueAtTime(chugRateFor(opts?.speed ?? 0), now);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.setValueAtTime(2200, now);
  const level = ctx.createGain();
  level.gain.setValueAtTime(clamp(opts?.level ?? 0, 0, 1), now);
  wire(src, [tone, level], destination);
  src.start(now);

  let stopped = false;
  return {
    setRate(speed) {
      if (stopped) return;
      src.playbackRate.setTargetAtTime(chugRateFor(speed), ctx.currentTime, SMOOTH);
    },
    setLevel(gain) {
      if (stopped) return;
      level.gain.setTargetAtTime(clamp(gain, 0, 1), ctx.currentTime, SMOOTH);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      level.gain.cancelScheduledValues(t);
      level.gain.setTargetAtTime(0, t, 0.01);
      // onended (set by wire) disconnects the source, filter and gain.
      src.stop(t + 0.05);
    },
  };
};

export const LOOP_RECIPES: Readonly<Record<LoopRecipeName, LoopRecipe>> = {
  chug: startChugLoop,
};

export function isLoopRecipe(name: SynthRecipeName): name is LoopRecipeName {
  return name === 'chug';
}
