// Feature: track-diorama-builder, Property 25: Loading never crashes
/**
 * **Validates: Requirements 24.2, 24.5, 33.5**
 *
 * For any strings stored under `wooden-diorama:v1`, `wooden-diorama:audio` and
 * `wooden-diorama:settings` (including the empty string, random text, random
 * JSON and mutated save files), loading the menu and the settings throws
 * nothing, logs no console error, and yields either a list of valid entries or
 * the empty state, plus valid audio and app settings.
 *
 * Loading means `createSaveRepository(...).list()` and `.get(id)` plus
 * `createSettingsRepository(...).loadAudio()` and `.loadApp()`, run with their
 * default warning sink (`console.warn`, silenced here) so the real logging path
 * is exercised. The storage under them is a memory storage, a storage whose
 * every method throws, or `browserStorage()` over a stubbed `window` whose
 * localStorage is missing or throws.
 *
 * The shape checks below are written from the rules in Requirement 24.1 and do
 * not call the validators in `saveFormat.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { SAVE_KEY, createSaveRepository } from '@/persistence/saveRepository';
import { AUDIO_KEY, SETTINGS_KEY, createSettingsRepository } from '@/persistence/settingsRepository';
import { browserStorage, memoryStorage, type KeyValueStorage } from '@/persistence/storage';
import { PIECE_TYPES, ROTATIONS, arbDiorama, arbInvalidEntry, arbSaveFile } from './arbitraries';

// ---------------------------------------------------------------------------
// Raw value generators
// ---------------------------------------------------------------------------

/** Keys that can confuse naive object handling. */
const SPECIAL_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'] as const;

/**
 * Sentinel strings swapped for raw JSON number tokens after serialisation, so
 * the stored text holds numbers `JSON.stringify` cannot produce (1e400 parses
 * to Infinity, 1e-400 to 0, the long integer loses precision).
 */
const NUMBER_TOKENS: Record<string, string> = {
  '@@HUGE_POS@@': '1e400',
  '@@HUGE_NEG@@': '-1e400',
  '@@TINY@@': '1e-400',
  '@@LONG_INT@@': '123456789012345678901234567890',
  '@@NEG_ZERO@@': '-0',
};

/** Serialises a value and replaces the number sentinels with their raw tokens. */
function serialise(value: unknown): string | null {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return null;
  }
  if (typeof text !== 'string') return null;
  for (const [sentinel, token] of Object.entries(NUMBER_TOKENS)) {
    text = text.split(JSON.stringify(sentinel)).join(token);
  }
  return text;
}

/** Values that break a field's rule in many ways, including huge and odd numbers. */
const arbWeird: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(
    ...Object.keys(NUMBER_TOKENS),
    1e308, -1e308, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 2, Number.MIN_VALUE,
    -1, 0.5, 1, 16, 15, 14, 90, 180, 360, 1.5,
    '', ' ', '0', '1', 'true', 'bedroom', 'straight', '__proto__',
    null, true, false, {}, [], [[]], { version: 1 },
  ),
  fc.jsonValue({ maxDepth: 3 }),
  arbDiorama,
  arbInvalidEntry,
);

/** An own, enumerable property, so `__proto__` is serialised as a key instead of setting the prototype. */
function defineOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

type Path = Array<string | number>;

/** Every path in a JSON tree (root included), capped to keep runs fast. */
function pathsOf(root: unknown, cap = 400): Path[] {
  const out: Path[] = [];
  const walk = (v: unknown, path: Path): void => {
    if (out.length >= cap) return;
    out.push(path);
    if (Array.isArray(v)) v.forEach((c, i) => walk(c, [...path, i]));
    else if (typeof v === 'object' && v !== null) {
      for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k], [...path, k]);
    }
  };
  walk(root, []);
  return out;
}

function getAt(root: unknown, path: Path): unknown {
  let v = root;
  for (const k of path) v = (v as Record<string | number, unknown>)[k];
  return v;
}

type Mutation =
  | { kind: 'replace'; at: number; value: unknown }
  | { kind: 'delete'; at: number }
  | { kind: 'addKey'; at: number; key: string; value: unknown }
  | { kind: 'duplicate'; at: number };

const arbMutation: fc.Arbitrary<Mutation> = fc.oneof(
  fc.record({ kind: fc.constant('replace' as const), at: fc.nat(), value: arbWeird }),
  fc.record({ kind: fc.constant('delete' as const), at: fc.nat() }),
  fc.record({
    kind: fc.constant('addKey' as const),
    at: fc.nat(),
    key: fc.oneof(fc.constantFrom(...SPECIAL_KEYS), fc.constantFrom('version', 'dioramas', 'id', 'pieces', 'muted')),
    value: arbWeird,
  }),
  fc.record({ kind: fc.constant('duplicate' as const), at: fc.nat() }),
);

/** Applies one mutation in place to a JSON tree; returns the (possibly new) root. */
function mutate(root: unknown, m: Mutation): unknown {
  const paths = pathsOf(root);
  const path = paths[m.at % paths.length] ?? [];
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  const parent = path.length > 0 ? (getAt(root, parentPath) as Record<string | number, unknown>) : null;
  const node = getAt(root, path);

  switch (m.kind) {
    case 'replace':
      if (parent === null || last === undefined) return m.value;
      if (Array.isArray(parent)) parent[last as number] = m.value;
      else defineOwn(parent as Record<string, unknown>, String(last), m.value);
      return root;
    case 'delete':
      if (parent === null || last === undefined) return root;
      if (Array.isArray(parent)) parent.splice(last as number, 1);
      else delete parent[last];
      return root;
    case 'addKey':
      if (Array.isArray(node)) node.push(m.value);
      else if (typeof node === 'object' && node !== null) defineOwn(node as Record<string, unknown>, m.key, m.value);
      return root;
    case 'duplicate':
      if (Array.isArray(node) && node.length > 0) node.push(JSON.parse(JSON.stringify(node[0])) as unknown);
      return root;
  }
}

/** A valid SaveFile with 1 to 4 random structural mutations, optionally truncated as text. */
const arbMutatedSaveFile: fc.Arbitrary<string> = fc
  .tuple(arbSaveFile(4), fc.array(arbMutation, { minLength: 1, maxLength: 4 }), fc.option(fc.nat(), { nil: undefined }))
  .map(([file, mutations, cut]) => {
    let tree: unknown = JSON.parse(JSON.stringify(file));
    for (const m of mutations) tree = mutate(tree, m);
    const text = serialise(tree) ?? '';
    return cut === undefined || text.length === 0 ? text : text.slice(0, cut % text.length);
  });

/** Deeply nested JSON, alone or embedded where an entry, a piece or a field value is expected. */
const arbDeep: fc.Arbitrary<string> = fc
  .tuple(fc.integer({ min: 1, max: 20_000 }), fc.constantFrom('array', 'object'), fc.constantFrom('alone', 'entry', 'piece', 'field', 'unclosed'))
  .map(([depth, shape, where]) => {
    const nested = shape === 'array' ? '['.repeat(depth) + ']'.repeat(depth) : '{"a":'.repeat(depth) + '1' + '}'.repeat(depth);
    switch (where) {
      case 'alone':
        return nested;
      case 'entry':
        return `{"version":1,"dioramas":[${nested}]}`;
      case 'piece':
        return `{"version":1,"dioramas":[{"id":"d","name":"n","setting":"bedroom","startFacing":0,"pieces":[${nested}],"createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-01T00:00:00.000Z"}]}`;
      case 'field':
        return `{"muted":${nested},"musicVolume":${nested},"sfxVolume":0.2,"lowQuality":${nested}}`;
      default:
        return '['.repeat(depth);
    }
  });

/** Hand-written texts with special keys, huge numbers and other edge cases. */
const arbTemplate: fc.Arbitrary<string> = fc.constantFrom(
  '',
  ' ',
  'null',
  'undefined',
  'NaN',
  '1e400',
  '-1e400',
  '"wooden-diorama"',
  '[]',
  '{}',
  '{"version":1}',
  '{"version":1,"dioramas":{}}',
  '{"version":"1","dioramas":[]}',
  '{"version":1e400,"dioramas":[]}',
  '{"version":1.0000000000000001,"dioramas":[]}',
  '{"version":1,"dioramas":[null,1,"x",[],{}]}',
  '{"__proto__":{"version":1,"dioramas":[]}}',
  '{"constructor":{"prototype":{"polluted":true}},"version":1,"dioramas":[]}',
  '{"version":1,"dioramas":[{"__proto__":{"id":"p","name":"n","setting":"bedroom","startFacing":0,"pieces":[],"createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-01T00:00:00.000Z"}}]}',
  '{"version":1,"dioramas":[{"id":"__proto__","name":"constructor","setting":"kitchen","startFacing":180,"pieces":[{"id":"__proto__","type":"house","gridX":1e400,"gridZ":0,"rotation":0}],"createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-01T00:00:00.000Z"}]}',
  '{"version":1,"dioramas":[{"id":"x","name":"n","setting":"bedroom","startFacing":0,"pieces":[{"id":"a","type":"constructor","gridX":0,"gridZ":0,"rotation":0}],"createdAt":"+275760-09-13T00:00:00.000Z","updatedAt":"9999-12-31T23:59:59.999Z"}]}',
  '{"muted":"true","musicVolume":1e400,"sfxVolume":-1e400,"lowQuality":"false"}',
  '{"muted":true,"musicVolume":-0,"sfxVolume":1e-400,"lowQuality":true}',
  '{"__proto__":{"muted":true,"musicVolume":0.1,"sfxVolume":0.1,"lowQuality":true}}',
  '{"muted":false,"musicVolume":123456789012345678901234567890,"sfxVolume":0.999999999999999999999}',
  '\uFEFF{"version":1,"dioramas":[]}',
  '\uD800',
);

/** Arbitrary JS values serialised as JSON (dropping values JSON cannot represent). */
const arbAnythingJson: fc.Arbitrary<string> = fc
  .anything({ maxDepth: 4, withNullPrototype: true, withObjectString: true, withDate: true, withSparseArray: true, withBoxedValues: true })
  .map((v) => serialise(v))
  .filter((s): s is string => s !== null);

/** Near-valid audio and app settings objects with weird field values and special keys. */
const arbNearSettings: fc.Arbitrary<string> = fc
  .tuple(
    fc.record(
      { muted: fc.oneof(fc.boolean(), arbWeird), musicVolume: fc.oneof(fc.double(), arbWeird), sfxVolume: fc.oneof(fc.double(), arbWeird), lowQuality: fc.oneof(fc.boolean(), arbWeird) },
      { requiredKeys: [] },
    ),
    fc.array(fc.tuple(fc.constantFrom(...SPECIAL_KEYS), arbWeird), { maxLength: 2 }),
  )
  .map(([o, extra]) => {
    const obj: Record<string, unknown> = { ...o };
    for (const [k, v] of extra) defineOwn(obj, k, v);
    return serialise(obj) ?? '{}';
  });

/** Any raw stored string. */
const arbRaw: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.jsonValue().map((v) => JSON.stringify(v)),
  arbAnythingJson,
  arbSaveFile(4).map((f) => JSON.stringify(f)),
  arbMutatedSaveFile,
  arbNearSettings,
  arbDeep,
  arbTemplate,
);

/** A raw value, or nothing stored under the key. */
const arbStored: fc.Arbitrary<string | undefined> = fc.option(arbRaw, { nil: undefined, freq: 6 });

const arbStoredKeys = fc.record({ save: arbStored, audio: arbStored, settings: arbStored });

/** Ids to look up: special names and arbitrary strings, besides the listed ids. */
const arbLookupIds = fc.array(fc.oneof(fc.string({ maxLength: 21 }), fc.constantFrom('', ...SPECIAL_KEYS, 'p', 'x', 'd')), { maxLength: 4 });

function initOf(stored: { save?: string; audio?: string; settings?: string }): Record<string, string> {
  const init: Record<string, string> = {};
  if (stored.save !== undefined) init[SAVE_KEY] = stored.save;
  if (stored.audio !== undefined) init[AUDIO_KEY] = stored.audio;
  if (stored.settings !== undefined) init[SETTINGS_KEY] = stored.settings;
  return init;
}

// ---------------------------------------------------------------------------
// Independent shape checks (Requirement 24.1)
// ---------------------------------------------------------------------------

const TYPE_SET = new Set<unknown>(PIECE_TYPES);
const ROTATION_SET = new Set<unknown>(ROTATIONS);
const DIORAMA_KEYS = new Set(['id', 'name', 'setting', 'startFacing', 'pieces', 'createdAt', 'updatedAt', 'thumbnail']);
const PIECE_KEYS = new Set(['id', 'type', 'gridX', 'gridZ', 'rotation']);

const isGridInt = (v: unknown, max: number): boolean => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isDate = (v: unknown): boolean => typeof v === 'string' && Number.isFinite(Date.parse(v));

function expectValidDiorama(d: unknown): void {
  expect(typeof d === 'object' && d !== null && !Array.isArray(d)).toBe(true);
  const o = d as Record<string, unknown>;
  for (const k of Object.keys(o)) expect(DIORAMA_KEYS.has(k)).toBe(true);
  expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
  expect(typeof o.id === 'string' && o.id.length > 0).toBe(true);
  expect(typeof o.name === 'string' && o.name.length >= 1 && o.name.length <= 40 && o.name.trim().length > 0).toBe(true);
  expect(['bedroom', 'kitchen']).toContain(o.setting);
  expect([0, 180]).toContain(o.startFacing);
  expect(isDate(o.createdAt) && isDate(o.updatedAt)).toBe(true);
  expect(o.thumbnail === undefined || typeof o.thumbnail === 'string').toBe(true);
  expect(Array.isArray(o.pieces)).toBe(true);

  const pieces = o.pieces as unknown[];
  const ids = new Set<string>();
  const tiles = new Set<string>();
  let stations = 0;
  for (const p of pieces) {
    expect(typeof p === 'object' && p !== null && !Array.isArray(p)).toBe(true);
    const q = p as Record<string, unknown>;
    for (const k of Object.keys(q)) expect(PIECE_KEYS.has(k)).toBe(true);
    expect(typeof q.id).toBe('string');
    expect(TYPE_SET.has(q.type)).toBe(true);
    expect(ROTATION_SET.has(q.rotation)).toBe(true);
    const max = q.type === 'hill' ? 14 : 15;
    expect(isGridInt(q.gridX, max) && isGridInt(q.gridZ, max)).toBe(true);
    ids.add(q.id as string);
    const x = q.gridX as number;
    const z = q.gridZ as number;
    const covered = q.type === 'hill' ? [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]] : [[x, z]];
    for (const [tx, tz] of covered) tiles.add(`${tx},${tz}`);
    if (q.type === 'station') stations++;
  }
  // D-20: unique piece ids, no shared tiles, at most one station.
  expect(ids.size).toBe(pieces.length);
  const tileCount = pieces.reduce<number>((n, p) => n + ((p as { type: unknown }).type === 'hill' ? 4 : 1), 0);
  expect(tiles.size).toBe(tileCount);
  expect(stations).toBeLessThanOrEqual(1);
}

const isUnit = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** Loads everything through the repositories and checks the results. Returns them for further checks. */
function loadAndCheck(storage: KeyValueStorage, lookupIds: readonly string[]) {
  const saves = createSaveRepository({ storage });
  const settings = createSettingsRepository({ storage });

  const listed = saves.list();
  expect(Array.isArray(listed)).toBe(true);
  listed.forEach(expectValidDiorama);
  const listedIds = listed.map((d) => d.id);
  expect(new Set(listedIds).size).toBe(listedIds.length);

  for (const id of [...listedIds, ...lookupIds]) {
    const got = saves.get(id);
    if (listedIds.includes(id)) {
      expect(got).not.toBeNull();
      expectValidDiorama(got);
      expect(got?.id).toBe(id);
    } else {
      expect(got).toBeNull();
    }
  }

  const audio = settings.loadAudio();
  expect(Object.keys(audio).sort()).toStrictEqual(['musicVolume', 'muted', 'sfxVolume']);
  expect(typeof audio.muted).toBe('boolean');
  expect(isUnit(audio.musicVolume) && isUnit(audio.sfxVolume)).toBe(true);

  const app = settings.loadApp();
  expect(Object.keys(app)).toStrictEqual(['lowQuality']);
  expect(typeof app.lowQuality).toBe('boolean');

  return { listed, audio, app };
}

const DEFAULT_AUDIO = { muted: false, musicVolume: 0.5, sfxVolume: 0.8 };
const DEFAULT_APP = { lowQuality: false };

// ---------------------------------------------------------------------------
// Throwing storages
// ---------------------------------------------------------------------------

/** Values a broken storage might throw: errors, DOMExceptions and non-Error values. */
const arbThrown: fc.Arbitrary<() => unknown> = fc.constantFrom<() => unknown>(
  () => new Error('boom'),
  () => new DOMException('denied', 'SecurityError'),
  () => new DOMException('full', 'QuotaExceededError'),
  () => new RangeError('Maximum call stack size exceeded'),
  () => 'a string',
  () => undefined,
  () => null,
  () => ({ name: 'Weird' }),
);

/** A storage whose every method throws, ignoring the `getItem` never-throws contract. */
function throwingStorage(make: () => unknown): KeyValueStorage {
  const fail = (): never => {
    throw make();
  };
  return { getItem: fail, setItem: fail, keys: fail };
}

type WindowScenario =
  | 'windowUndefined'
  | 'noLocalStorage'
  | 'localStorageNull'
  | 'getterThrows'
  | 'allReadsThrow'
  | 'readsThrowAfterProbe'
  | 'works';

/** A stand-in for `window.localStorage` backed by a Map, with optional read failures. */
function fakeLocalStorage(init: Record<string, string>, readFails: (key: string) => boolean, make: () => unknown): Storage {
  const data = new Map(Object.entries(init));
  const fail = (): never => {
    throw make();
  };
  return {
    get length() {
      return readFails('') ? fail() : data.size;
    },
    key: (i: number) => (readFails('') ? fail() : ([...data.keys()][i] ?? null)),
    getItem: (k: string) => (readFails(k) ? fail() : (data.get(k) ?? null)),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  } as Storage;
}

function windowFor(scenario: WindowScenario, init: Record<string, string>, make: () => unknown): unknown {
  switch (scenario) {
    case 'windowUndefined':
      return undefined;
    case 'noLocalStorage':
      return {};
    case 'localStorageNull':
      return { localStorage: null };
    case 'getterThrows':
      return Object.defineProperty({}, 'localStorage', {
        get() {
          throw make();
        },
      });
    case 'allReadsThrow':
      return { localStorage: fakeLocalStorage(init, () => true, make) };
    case 'readsThrowAfterProbe':
      return { localStorage: fakeLocalStorage(init, (k) => k !== 'wooden-diorama:probe', make) };
    case 'works':
      return { localStorage: fakeLocalStorage(init, () => false, make) };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Property 25: Loading never crashes', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let protoNames: string[];

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error');
    // The default warning sink is console.warn; silence it but keep it running.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    protoNames = Object.getOwnPropertyNames(Object.prototype).sort();
  });

  afterEach(() => {
    // Loading must never add properties to Object.prototype (`__proto__` / `constructor` keys).
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toStrictEqual(protoNames);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads any stored strings into valid dioramas and settings without throwing or logging errors', () => {
    fc.assert(
      fc.property(arbStoredKeys, arbLookupIds, (stored, lookupIds) => {
        const storage = memoryStorage(initOf(stored));
        expect(() => loadAndCheck(storage, lookupIds)).not.toThrow();
        // Nothing is stored or the stored value is missing: the defaults are used.
        if (stored.audio === undefined) expect(createSettingsRepository({ storage }).loadAudio()).toStrictEqual(DEFAULT_AUDIO);
        if (stored.settings === undefined) expect(createSettingsRepository({ storage }).loadApp()).toStrictEqual(DEFAULT_APP);
        if (stored.save === undefined) expect(createSaveRepository({ storage }).list()).toStrictEqual([]);
        expect(errorSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('gives the empty state and default settings when every storage read throws', () => {
    fc.assert(
      fc.property(arbThrown, arbLookupIds, (make, lookupIds) => {
        const { listed, audio, app } = loadAndCheck(throwingStorage(make), lookupIds);
        expect(listed).toStrictEqual([]);
        expect(audio).toStrictEqual(DEFAULT_AUDIO);
        expect(app).toStrictEqual(DEFAULT_APP);
        expect(errorSpy).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('loads safely through browserStorage() when localStorage is missing or throws', () => {
    const scenarios: WindowScenario[] = [
      'windowUndefined', 'noLocalStorage', 'localStorageNull', 'getterThrows',
      'allReadsThrow', 'readsThrowAfterProbe', 'works',
    ];
    fc.assert(
      fc.property(fc.constantFrom(...scenarios), arbThrown, arbStoredKeys, arbLookupIds, (scenario, make, stored, lookupIds) => {
        vi.stubGlobal('window', windowFor(scenario, initOf(stored), make));
        let storage: KeyValueStorage | undefined;
        expect(() => {
          storage = browserStorage();
        }).not.toThrow();
        const result = loadAndCheck(storage as KeyValueStorage, lookupIds);
        if (scenario !== 'works') {
          // Fallback to memory, or reads that fail: nothing is readable.
          expect(result.listed).toStrictEqual([]);
          expect(result.audio).toStrictEqual(DEFAULT_AUDIO);
          expect(result.app).toStrictEqual(DEFAULT_APP);
        }
        expect(errorSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
      }),
      { numRuns: 100 },
    );
  });
});
