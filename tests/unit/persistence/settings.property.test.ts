// Feature: track-diorama-builder, Property 32: Settings parse safely and round trip
/**
 * **Validates: Requirements 24.4, 27.9, 27.12, 33.5**
 *
 * For any valid audio settings (mute true or false, volumes from 0 to 1) and
 * any low quality flag, writing and then reading them returns equal values;
 * and for any stored string, the parsed audio settings have a boolean mute and
 * volumes from 0 to 1, with each invalid or missing field replaced by its
 * default (unmuted, 0.5, 0.8) and a warning logged only when a stored value
 * was present but invalid.
 *
 * The oracle below restates the default rules from the requirements
 * (Requirements 24.4, 24.6, 27.8, 27.12, 33.5 and the defaults in the
 * assumptions: unmuted, music 0.5, effects 0.8, low quality off) without
 * calling the parsers under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { parseAppSettings, parseAudioSettings } from '@/domain/saveFormat';
import {
  AUDIO_KEY,
  SETTINGS_KEY,
  createSettingsRepository,
} from '@/persistence/settingsRepository';
import { memoryStorage } from '@/persistence/storage';
import type { AppSettings, AudioSettings } from '@/domain/types';

// ---------------------------------------------------------------------------
// Oracle (independent of src/domain/saveFormat.ts)
// ---------------------------------------------------------------------------

const ORACLE_AUDIO_DEFAULTS = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 } as const;
const ORACLE_APP_DEFAULTS = { lowQuality: false } as const;

type Expected<T> = { settings: T; warn: boolean };

function hasOwn(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

/** Parses JSON, or returns a marker on failure. */
function oracleJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A stored volume is valid when it is a finite number from 0 to 1. −0 counts as 0. */
function validVolume(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) return null;
  return v === 0 ? 0 : v;
}

function oracleAudio(raw: string | null): Expected<AudioSettings> {
  // Requirement 24.6: a missing key gives the defaults and no warning.
  if (raw === null) return { settings: { ...ORACLE_AUDIO_DEFAULTS }, warn: false };
  const parsed = oracleJson(raw);
  // Requirement 24.4: not JSON (or not a settings object) gives all defaults and a warning.
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return { settings: { ...ORACLE_AUDIO_DEFAULTS }, warn: true };
  }
  const o = parsed.value;
  // Requirement 27.12: each invalid or missing field takes its own default.
  const muted = hasOwn(o, 'muted') && typeof o.muted === 'boolean' ? o.muted : null;
  const music = hasOwn(o, 'musicVolume') ? validVolume(o.musicVolume) : null;
  const sfx = hasOwn(o, 'sfxVolume') ? validVolume(o.sfxVolume) : null;
  return {
    settings: {
      muted: muted ?? ORACLE_AUDIO_DEFAULTS.muted,
      musicVolume: music ?? ORACLE_AUDIO_DEFAULTS.musicVolume,
      sfxVolume: sfx ?? ORACLE_AUDIO_DEFAULTS.sfxVolume,
    },
    warn: muted === null || music === null || sfx === null,
  };
}

function oracleApp(raw: string | null): Expected<AppSettings> {
  // Requirement 33.5: missing gives Low quality off without crashing.
  if (raw === null) return { settings: { ...ORACLE_APP_DEFAULTS }, warn: false };
  const parsed = oracleJson(raw);
  if (
    parsed.ok &&
    isPlainObject(parsed.value) &&
    hasOwn(parsed.value, 'lowQuality') &&
    typeof parsed.value.lowQuality === 'boolean'
  ) {
    return { settings: { lowQuality: parsed.value.lowQuality }, warn: false };
  }
  // Unreadable: Low quality off, with a warning because a stored value was present.
  return { settings: { ...ORACLE_APP_DEFAULTS }, warn: true };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** JSON text fragments for valid volumes, including edge spellings. */
const arbValidVolumeText: fc.Arbitrary<string> = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }).map((v) => JSON.stringify(v)),
  fc.constantFrom('0', '1', '-0', '0.0', '1.0', '1e-400', '5e-1', '0.8', '0.5'),
);

/** JSON text fragments that are not a valid volume. */
const arbInvalidVolumeText: fc.Arbitrary<string> = fc.oneof(
  fc.double({ noNaN: true }).filter((v) => v < 0 || v > 1).map((v) => JSON.stringify(v)),
  fc.constantFrom(
    '1e309', '-1e309', '-1', '1.0000001', '-0.0001', '2', '"0.5"', '"1"', 'null', 'true',
    'false', '[]', '[0.5]', '{}', '{"v":0.5}', '""',
  ),
);

const arbValidMutedText = fc.constantFrom('true', 'false');
const arbInvalidMutedText: fc.Arbitrary<string> = fc.constantFrom(
  '0', '1', '"true"', '"false"', 'null', '[]', '{}', '""', '1e309', '[true]',
);

/** A field that is missing, valid or invalid; `null` means missing. */
function arbField(valid: fc.Arbitrary<string>, invalid: fc.Arbitrary<string>) {
  return fc.oneof(fc.constant(null), valid, invalid);
}

/** Extra keys, including prototype-related names that must never count as settings. */
const arbExtraKey: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.constantFrom('__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'MUTED', 'lowquality'),
);

const arbExtraEntries = fc.array(
  fc.tuple(arbExtraKey, fc.json({ maxDepth: 2 })).map(([k, v]) => `${JSON.stringify(k)}:${v}`),
  { maxLength: 3 },
);

/** Joins `"key":value` entries in a random order into JSON object text, with random whitespace. */
function arbObjectText(entries: fc.Arbitrary<string[]>): fc.Arbitrary<string> {
  return entries
    .chain((es) => fc.shuffledSubarray(es, { minLength: es.length, maxLength: es.length }))
    .chain((es) =>
      fc.constantFrom('', ' ', '\n', '\t').map((ws) => `${ws}{${ws}${es.join(`,${ws}`)}${ws}}${ws}`),
    );
}

/** Objects mixing valid, invalid and missing audio fields with extra fields. */
const arbAudioObjectText: fc.Arbitrary<string> = arbObjectText(
  fc
    .tuple(
      arbField(arbValidMutedText, arbInvalidMutedText),
      arbField(arbValidVolumeText, arbInvalidVolumeText),
      arbField(arbValidVolumeText, arbInvalidVolumeText),
      arbExtraEntries,
    )
    .map(([m, mv, sv, extra]) => [
      ...(m === null ? [] : [`"muted":${m}`]),
      ...(mv === null ? [] : [`"musicVolume":${mv}`]),
      ...(sv === null ? [] : [`"sfxVolume":${sv}`]),
      ...extra,
    ]),
);

/** Objects with a valid, invalid or missing `lowQuality` field and extra fields. */
const arbAppObjectText: fc.Arbitrary<string> = arbObjectText(
  fc
    .tuple(arbField(fc.constantFrom('true', 'false'), arbInvalidMutedText), arbExtraEntries)
    .map(([lq, extra]) => [...(lq === null ? [] : [`"lowQuality":${lq}`]), ...extra]),
);

/** Settings hidden under `__proto__`: an own `__proto__` key, never an inherited value. */
const arbProtoText: fc.Arbitrary<string> = fc.constantFrom(
  '{"__proto__":{"muted":true,"musicVolume":0.1,"sfxVolume":0.2,"lowQuality":true}}',
  '{"__proto__":{"lowQuality":true},"muted":true}',
  '{"constructor":{"prototype":{"muted":true}}}',
);

/** Any stored value: missing, arbitrary text, arbitrary JSON, or a settings-shaped object. */
function arbRaw(objectText: fc.Arbitrary<string>): fc.Arbitrary<string | null> {
  return fc.oneof(
    { arbitrary: fc.constant(null), weight: 1 },
    { arbitrary: fc.constantFrom('', ' ', 'null', 'undefined', 'NaN', '{', '[]', '0'), weight: 1 },
    { arbitrary: fc.string(), weight: 2 },
    { arbitrary: fc.json(), weight: 2 },
    { arbitrary: arbProtoText, weight: 1 },
    { arbitrary: objectText, weight: 6 },
  );
}

const arbAudioSettings: fc.Arbitrary<AudioSettings> = fc.record({
  muted: fc.boolean(),
  musicVolume: fc.oneof(fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(0, 1, 0.5, 0.8)),
  sfxVolume: fc.oneof(fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(0, 1, 0.5, 0.8)),
});

/** Extra fields on the in-memory object that must not reach storage. */
const arbExtras: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  arbExtraKey.filter((k) => !['muted', 'musicVolume', 'sfxVolume', 'lowQuality'].includes(k)),
  fc.jsonValue(),
  { maxKeys: 3 },
);

const unsign = (n: number): number => (n === 0 ? 0 : n);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 32: Settings parse safely and round trip', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses any stored audio string to the per-field defaults rule and warns only for a present invalid value', () => {
    fc.assert(
      fc.property(arbRaw(arbAudioObjectText), (raw) => {
        const expected = oracleAudio(raw);

        // Pure parser.
        const parsed = parseAudioSettings(raw);
        expect(parsed.settings).toStrictEqual(expected.settings);
        expect(parsed.warn).toBe(expected.warn);
        expect(typeof parsed.settings.muted).toBe('boolean');
        for (const v of [parsed.settings.musicVolume, parsed.settings.sfxVolume]) {
          expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
        }

        // Through the repository: one warning exactly when a stored value was invalid.
        const warn = vi.fn();
        const storage = memoryStorage(raw === null ? {} : { [AUDIO_KEY]: raw });
        const repo = createSettingsRepository({ storage, warn });
        expect(repo.loadAudio()).toStrictEqual(expected.settings);
        expect(warn).toHaveBeenCalledTimes(expected.warn ? 1 : 0);
        // Loading never writes.
        expect(storage.getItem(AUDIO_KEY)).toBe(raw);
      }),
      { numRuns: 100 },
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('parses any stored app-settings string to Low quality off unless lowQuality is a stored boolean', () => {
    fc.assert(
      fc.property(arbRaw(arbAppObjectText), (raw) => {
        const expected = oracleApp(raw);

        const parsed = parseAppSettings(raw);
        expect(parsed.settings).toStrictEqual(expected.settings);
        expect(parsed.warn).toBe(expected.warn);

        const warn = vi.fn();
        const storage = memoryStorage(raw === null ? {} : { [SETTINGS_KEY]: raw });
        const repo = createSettingsRepository({ storage, warn });
        expect(repo.loadApp()).toStrictEqual(expected.settings);
        expect(warn).toHaveBeenCalledTimes(expected.warn ? 1 : 0);
        expect(storage.getItem(SETTINGS_KEY)).toBe(raw);
      }),
      { numRuns: 100 },
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('round trips any valid audio and app settings, storing exactly the known fields', () => {
    fc.assert(
      fc.property(arbAudioSettings, fc.boolean(), arbExtras, (audio, lowQuality, extras) => {
        const storage = memoryStorage();
        const warn = vi.fn();
        const writer = createSettingsRepository({ storage, warn });

        const audioIn = { ...extras, ...audio } as AudioSettings;
        const appIn = { ...extras, lowQuality } as AppSettings;
        expect(writer.saveAudio(audioIn)).toBe(true);
        expect(writer.saveApp(appIn)).toBe(true);

        // Stored JSON holds exactly the known fields with the given values.
        const storedAudio = JSON.parse(storage.getItem(AUDIO_KEY) as string) as Record<string, unknown>;
        expect(Object.keys(storedAudio).sort()).toEqual(['musicVolume', 'muted', 'sfxVolume']);
        const storedApp = JSON.parse(storage.getItem(SETTINGS_KEY) as string) as Record<string, unknown>;
        expect(Object.keys(storedApp)).toEqual(['lowQuality']);

        const expectedAudio: AudioSettings = {
          muted: audio.muted,
          musicVolume: unsign(audio.musicVolume),
          sfxVolume: unsign(audio.sfxVolume),
        };

        // Same repository and a fresh one on the same storage (a simulated reload).
        const reader = createSettingsRepository({ storage, warn });
        for (const repo of [writer, reader]) {
          expect(repo.loadAudio()).toStrictEqual(expectedAudio);
          expect(repo.loadApp()).toStrictEqual({ lowQuality });
        }
        expect(warn).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
