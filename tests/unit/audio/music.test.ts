/**
 * Unit tests for the background music controller (`src/audio/music.ts`).
 * `howler` and `tone` are replaced with small recording fakes, so the tests
 * check how the controller drives them without real audio.
 *
 * Requirements: 1.7, 27.1, 27.2, 27.3, 34.12
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Fakes (hoisted so the vi.mock factories can use them)
// ---------------------------------------------------------------------------

const fakes = vi.hoisted(() => {
  interface HowlOptions {
    src: string[];
    loop?: boolean;
    html5?: boolean;
    volume?: number;
    onloaderror?: (id: number, err: unknown) => void;
  }
  const howls: FakeHowl[] = [];
  class FakeHowl {
    readonly calls: string[] = [];
    vol: number;
    readonly options: HowlOptions;
    constructor(options: HowlOptions) {
      this.options = options;
      this.vol = options.volume ?? 1;
      howls.push(this);
    }
    play() {
      this.calls.push('play');
      return 1;
    }
    stop() {
      this.calls.push('stop');
      return this;
    }
    unload() {
      this.calls.push('unload');
    }
    volume(v?: number) {
      if (v !== undefined) this.vol = v;
      return this.vol;
    }
  }

  const tone = {
    log: [] as string[],
    loops: [] as Array<{ callback: (time: number) => void; interval: unknown }>,
    triggers: [] as Array<{ voice: string; args: unknown[] }>,
    connections: [] as Array<{ from: string; to: unknown }>,
    disposed: [] as string[],
    failContext: false,
    raw: null as unknown,
  };

  class Node {
    volume = { value: 0 };
    readonly kind: string;
    constructor(kind: string) {
      this.kind = kind;
    }
    connect(to: unknown) {
      tone.connections.push({ from: this.kind, to });
      return this;
    }
    dispose() {
      tone.disposed.push(this.kind);
      return this;
    }
    triggerAttackRelease(...args: unknown[]) {
      tone.triggers.push({ voice: this.kind, args });
      return this;
    }
  }
  class FMSynth extends Node {}
  class Synth extends Node {
    constructor() {
      super('Synth');
    }
  }
  class PolySynth extends Node {
    constructor(voice: unknown) {
      super(voice === FMSynth ? 'PolySynth(FMSynth)' : 'PolySynth(Synth)');
    }
  }
  class Gain extends Node {
    constructor() {
      super('Gain');
    }
  }
  class Filter extends Node {
    constructor(opts: { type: string }) {
      super(`Filter(${opts.type})`);
    }
  }
  class NoiseSynth extends Node {
    constructor() {
      super('NoiseSynth');
    }
  }
  class Loop extends Node {
    constructor(callback: (time: number) => void, interval: unknown) {
      super('Loop');
      tone.loops.push({ callback, interval });
    }
    start(t: unknown) {
      tone.log.push(`loop.start(${String(t)})`);
      return this;
    }
  }
  class Context {
    readonly rawContext: unknown;
    constructor(rawContext: unknown) {
      this.rawContext = rawContext;
      if (tone.failContext) throw new Error('context failed');
      tone.log.push('new Context');
    }
  }
  const transport = {
    bpm: { value: 120 },
    start: (t: unknown) => tone.log.push(`transport.start(${String(t)})`),
    stop: () => tone.log.push('transport.stop'),
    cancel: () => tone.log.push('transport.cancel'),
  };
  const toneModule = {
    FMSynth,
    Synth,
    PolySynth,
    Gain,
    Filter,
    NoiseSynth,
    Loop,
    Context,
    getContext: () => ({ rawContext: tone.raw }),
    setContext: (ctx: Context, disposeOld?: boolean) => {
      tone.raw = ctx.rawContext;
      tone.log.push(`setContext(disposeOld=${String(disposeOld)})`);
    },
    getTransport: () => transport,
  };
  return { howls, FakeHowl, tone, toneModule, transport };
});

vi.mock('howler', () => ({ Howl: fakes.FakeHowl }));
vi.mock('tone', () => fakes.toneModule);

import { MUSIC_BPM, MUSIC_FILES, PROGRESSION, SONG_STEPS, createMusic, songStep } from '@/audio/music';

// ---------------------------------------------------------------------------
// Fake Web Audio context
// ---------------------------------------------------------------------------

function fakeAudio() {
  const destination = { name: 'masterGain' };
  const gains: Array<{
    gain: { value: number; targets: number[]; setTargetAtTime(v: number): void };
    connectedTo: unknown[];
    disconnected: boolean;
  }> = [];
  const ctx = {
    currentTime: 0,
    createGain() {
      const node = {
        context: ctx,
        gain: {
          value: 1,
          targets: [] as number[],
          setTargetAtTime(v: number) {
            this.targets.push(v);
            this.value = v;
          },
        },
        connectedTo: [] as unknown[],
        disconnected: false,
        connect(to: unknown) {
          node.connectedTo.push(to);
          return to;
        },
        disconnect() {
          node.disconnected = true;
        },
      };
      gains.push(node);
      return node;
    },
  };
  return {
    ctx: ctx as unknown as AudioContext,
    destination: destination as unknown as AudioNode,
    gains,
  };
}

beforeEach(() => {
  fakes.howls.length = 0;
  const t = fakes.tone;
  t.log.length = 0;
  t.loops.length = 0;
  t.triggers.length = 0;
  t.connections.length = 0;
  t.disposed.length = 0;
  t.failContext = false;
  t.raw = null;
  fakes.transport.bpm.value = 120;
});

// ---------------------------------------------------------------------------
// Song data
// ---------------------------------------------------------------------------

describe('song data', () => {
  it('plays I–vi–IV–V at 92 BPM, one chord per bar, twice per loop', () => {
    expect(MUSIC_BPM).toBe(92);
    expect(PROGRESSION.map((c) => c.degree)).toEqual(['I', 'vi', 'IV', 'V']);
    const bars = Array.from({ length: SONG_STEPS / 8 }, (_, bar) => songStep(bar * 8));
    expect(bars.map((s) => s.chord.name)).toEqual(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']);
    for (const s of bars) expect(s.pad).toEqual(s.chord.pad);
  });

  it('starts the pad only on bar starts, wraps around, and keeps velocities soft', () => {
    for (let step = 0; step < SONG_STEPS; step++) {
      const s = songStep(step);
      expect(s.pad !== null).toBe(step % 8 === 0);
      expect(s.brush).toBeGreaterThan(0);
      expect(s.brush).toBeLessThanOrEqual(0.6);
      if (s.marimba) expect(s.marimba.velocity).toBeLessThanOrEqual(0.6);
      expect(songStep(step + SONG_STEPS)).toEqual(s);
    }
  });
});

// ---------------------------------------------------------------------------
// File source
// ---------------------------------------------------------------------------

describe('file music', () => {
  it('has no sourced music file yet, so the tone fallback is used', () => {
    expect(MUSIC_FILES).toBeNull();
  });

  it('loops the file with a Howl through Web Audio and routes volume through it', async () => {
    const audio = fakeAudio();
    const loadTone = vi.fn(() => import('tone'));
    const music = createMusic({
      fileSrc: ['/assets/audio/music/loop.ogg', '/assets/audio/music/loop.mp3'],
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      loadTone: loadTone as never,
      volume: 0.4,
      warn: vi.fn(),
    });
    await music.start();

    expect(music.source).toBe('file');
    expect(fakes.howls).toHaveLength(1);
    const howl = fakes.howls[0]!;
    expect(howl.options).toMatchObject({
      src: ['/assets/audio/music/loop.ogg', '/assets/audio/music/loop.mp3'],
      loop: true,
      html5: false,
      volume: 0.4,
    });
    expect(howl.calls).toEqual(['play']);
    expect(loadTone).not.toHaveBeenCalled();

    music.setVolume(0.9);
    expect(howl.vol).toBe(0.9);
    music.setVolume(3);
    expect(howl.vol).toBe(1);

    music.stop();
    expect(howl.calls).toEqual(['play', 'stop', 'unload']);
    expect(music.source).toBe('none');
  });

  it('falls back to generated music when the file fails to load', async () => {
    const audio = fakeAudio();
    const warn = vi.fn();
    const music = createMusic({
      fileSrc: ['/assets/audio/music/missing.ogg'],
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      warn,
    });
    await music.start();
    fakes.howls[0]!.options.onloaderror?.(1, 'decode error');
    await vi.waitFor(() => expect(music.source).toBe('tone'));
    expect(fakes.howls[0]!.calls).toContain('unload');
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tone source
// ---------------------------------------------------------------------------

describe('generated music', () => {
  it('loads tone dynamically, uses the Howler context and plays into a dedicated music gain', async () => {
    const audio = fakeAudio();
    const warn = vi.fn();
    const music = createMusic({
      fileSrc: null,
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      volume: 0.5,
      warn,
    });
    expect(music.source).toBe('none');
    await music.start();

    expect(music.source).toBe('tone');
    expect(warn).not.toHaveBeenCalled();
    expect(fakes.howls).toHaveLength(0);

    // Tone now runs on Howler's context; its old default context is disposed.
    expect(fakes.tone.raw).toBe(audio.ctx);
    expect(fakes.tone.log).toContain('setContext(disposeOld=true)');

    // A dedicated gain at the music volume feeds Howler's master gain.
    expect(audio.gains).toHaveLength(1);
    const gain = audio.gains[0]!;
    expect(gain.gain.value).toBe(0.5);
    expect(gain.connectedTo).toEqual([audio.destination]);
    // Tone's bus connects to that gain, not to Tone.Destination.
    expect(fakes.tone.connections).toContainEqual({ from: 'Gain', to: gain });

    // Voices: marimba-like FM, pad, bass and filtered brush noise.
    const kinds = fakes.tone.connections.map((c) => c.from);
    expect(kinds).toEqual(
      expect.arrayContaining(['PolySynth(FMSynth)', 'PolySynth(Synth)', 'Synth', 'NoiseSynth', 'Filter(bandpass)']),
    );

    // The transport runs at 92 BPM with one eighth-note loop.
    expect(fakes.transport.bpm.value).toBe(92);
    expect(fakes.tone.loops).toHaveLength(1);
    expect(fakes.tone.loops[0]!.interval).toBe('8n');
    expect(fakes.tone.log).toContain('transport.start(+0.05)');

    // The first step plays the C chord on the pad, the bass root and a marimba note.
    fakes.tone.loops[0]!.callback(1);
    const voices = fakes.tone.triggers.map((t) => t.voice);
    expect(voices).toEqual(['PolySynth(Synth)', 'Synth', 'PolySynth(FMSynth)', 'NoiseSynth']);
    expect(fakes.tone.triggers[0]!.args[0]).toEqual(['C4', 'E4', 'G4']);

    // Volume changes reach the music gain at once.
    music.setVolume(0.2);
    expect(gain.gain.targets).toEqual([0.2]);

    music.stop();
    expect(music.source).toBe('none');
    expect(gain.disconnected).toBe(true);
    expect(fakes.tone.log).toContain('transport.stop');
    expect(fakes.tone.disposed).toEqual(expect.arrayContaining(['Loop', 'NoiseSynth', 'Gain']));
  });

  it('does not replace the Tone context when it already uses Howler’s context', async () => {
    const audio = fakeAudio();
    fakes.tone.raw = audio.ctx;
    const music = createMusic({
      fileSrc: null,
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      warn: vi.fn(),
    });
    await music.start();
    expect(music.source).toBe('tone');
    expect(fakes.tone.log.some((l) => l.startsWith('setContext'))).toBe(false);
  });

  it('start is idempotent', async () => {
    const audio = fakeAudio();
    const loadTone = vi.fn(async () => (await import('tone')) as never);
    const music = createMusic({
      fileSrc: null,
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      loadTone,
      warn: vi.fn(),
    });
    const a = music.start();
    const b = music.start();
    expect(b).toBe(a);
    await a;
    await music.start();
    expect(loadTone).toHaveBeenCalledTimes(1);
    expect(fakes.tone.loops).toHaveLength(1);
    expect(audio.gains).toHaveLength(1);
  });

  it('a stop during the import leaves the music silent', async () => {
    const audio = fakeAudio();
    const music = createMusic({
      fileSrc: null,
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      warn: vi.fn(),
    });
    const p = music.start();
    music.stop();
    await p;
    expect(music.source).toBe('none');
    expect(fakes.tone.loops).toHaveLength(0);
  });

  it('a failed import logs one warning, no error, and leaves the music silent', async () => {
    const audio = fakeAudio();
    const warn = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const music = createMusic({
      fileSrc: null,
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      loadTone: () => Promise.reject(new Error('chunk failed')),
      warn,
    });
    await expect(music.start()).resolves.toBeUndefined();
    await music.start();
    expect(music.source).toBe('none');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(audio.gains).toHaveLength(0);
    music.setVolume(0.3); // safe while silent
    error.mockRestore();
  });

  it('a failed Tone setup logs one warning and releases the music gain', async () => {
    const audio = fakeAudio();
    const warn = vi.fn();
    fakes.tone.failContext = true;
    const music = createMusic({
      fileSrc: null,
      getContext: () => audio.ctx,
      destination: () => audio.destination,
      warn,
    });
    await expect(music.start()).resolves.toBeUndefined();
    expect(music.source).toBe('none');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(audio.gains[0]!.disconnected).toBe(true);
  });

  it('without a Web Audio context, warns once and stays silent', async () => {
    const warn = vi.fn();
    const loadTone = vi.fn();
    const music = createMusic({
      fileSrc: null,
      getContext: () => null,
      destination: () => null,
      loadTone: loadTone as never,
      warn,
    });
    await music.start();
    expect(music.source).toBe('none');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(loadTone).not.toHaveBeenCalled();
  });
});
