// Feature: track-diorama-builder, Property 28: Writes touch only their own entry
/**
 * **Validates: Requirements 5.5, 22.13, 24.7, 36.5**
 *
 * For any stored save file (including invalid entries) and any upsert, rename
 * or remove of one diorama, every other element of the stored `dioramas`
 * array, valid or not, is unchanged and in the same position, exactly one
 * entry exists per saved id, and an upsert of an existing id replaces that
 * entry in place.
 *
 * The stored file mixes valid dioramas (unique ids), invalid entries from
 * `arbInvalidEntry`, and invalid entries that reuse a valid diorama's id
 * (so the repository must act on the valid entry, not the invalid twin).
 * Which entries are valid is known from how they were generated; the oracle
 * never calls the validators. Corrupt files are excluded (Property 31).
 *
 * Writes covered, following the repository's documented semantics:
 * - upsert of a never-saved draft (id null): appended at the end;
 * - upsert of an id with a valid entry: that entry replaced in place,
 *   `createdAt` kept;
 * - upsert of an id held only by an invalid raw entry: the first such raw
 *   entry replaced in place;
 * - upsert of an id held by no entry: appended at the end;
 * - rename of a valid entry: replaced in place with the trimmed name;
 * - remove of a valid entry: only that entry taken out.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CORRUPT_BACKUP_PREFIX,
  SAVE_KEY,
  createSaveRepository,
  type DioramaDraft,
} from '@/persistence/saveRepository';
import { memoryStorage, type KeyValueStorage } from '@/persistence/storage';
import type { Diorama } from '@/domain/types';
import { arbDiorama, arbDioramas, arbInvalidEntry, arbName, arbPieces, arbThumbnail } from './arbitraries';

type Tagged = { valid: true; entry: Diorama } | { valid: false; entry: unknown };

/** Largest instant whose ISO string still has a 4-digit year. */
const MAX_ISO_MS = 253_402_300_799_999;

/** Field overrides that each make a valid diorama invalid (Requirement 24.1). */
const BREAKERS: ReadonlyArray<Record<string, unknown>> = [
  { startFacing: 90 },
  { setting: 'garden' },
  { createdAt: 'yesterday' },
  { name: '' },
  { pieces: null },
  { thumbnail: 42 },
];

/** Keys stored next to the SaveFile; a write must leave every one of them alone. */
const OTHER_KEYS: Readonly<Record<string, string>> = {
  'wooden-diorama:audio': JSON.stringify({ muted: false, musicVolume: 0.5, sfxVolume: 0.8 }),
  'wooden-diorama:settings': JSON.stringify({ lowQuality: true }),
  [`${CORRUPT_BACKUP_PREFIX}2024-01-01T00:00:00.000Z`]: 'not json {',
};

/** Own string `id` of a raw entry, or undefined. Written independently of the repository. */
function idOf(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(entry, 'id')) return undefined;
  const id = (entry as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

/** JSON round trip: what a value looks like once stored. */
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** Shuffles a fixed list into a random order (every element kept). */
function shuffled<T>(items: T[]): fc.Arbitrary<T[]> {
  return fc.shuffledSubarray(items, { minLength: items.length, maxLength: items.length });
}

/** Valid dioramas, invalid entries and invalid twins of valid ids, shuffled. */
const arbStored: fc.Arbitrary<Tagged[]> = fc
  .tuple(
    arbDioramas(6),
    fc.array(arbInvalidEntry, { maxLength: 5 }),
    fc.array(fc.tuple(fc.nat(), arbDiorama, fc.constantFrom(...BREAKERS)), { maxLength: 3 }),
  )
  .chain(([valid, invalid, twinSeeds]) => {
    const twins: unknown[] =
      valid.length === 0
        ? []
        : twinSeeds.map(([i, d, breaker]) => ({ ...d, id: valid[i % valid.length].id, ...breaker }));
    return shuffled<Tagged>([
      ...valid.map((entry): Tagged => ({ valid: true, entry })),
      ...invalid.map((entry): Tagged => ({ valid: false, entry })),
      ...twins.map((entry): Tagged => ({ valid: false, entry })),
    ]);
  });

/** The editor state passed to upsert, without its id. */
const arbDraftBody: fc.Arbitrary<Omit<DioramaDraft, 'id'>> = fc.record({
  name: arbName,
  setting: fc.constantFrom<Diorama['setting']>('bedroom', 'kitchen'),
  startFacing: fc.constantFrom<Diorama['startFacing']>(0, 180),
  pieces: arbPieces,
  thumbnail: fc.option(arbThumbnail, { nil: null }),
  createdAt: fc.option(
    fc.integer({ min: 0, max: MAX_ISO_MS }).map((ms) => new Date(ms).toISOString()),
    { nil: null },
  ),
});

type Op =
  | { kind: 'upsertNew'; draft: Omit<DioramaDraft, 'id'> }
  | { kind: 'upsertExisting'; target: number; draft: Omit<DioramaDraft, 'id'> }
  | { kind: 'upsertInvalidId'; id: string; draft: Omit<DioramaDraft, 'id'> }
  | { kind: 'upsertMissingId'; id: string; draft: Omit<DioramaDraft, 'id'> }
  | { kind: 'rename'; target: number; name: string }
  | { kind: 'remove'; target: number };

interface Case {
  stored: Tagged[];
  op: Op;
  nowMs: number;
}

const arbCase: fc.Arbitrary<Case> = arbStored.chain((stored) => {
  const validIdx = stored.flatMap((t, i) => (t.valid ? [i] : []));
  const validIds = new Set(validIdx.map((i) => (stored[i].entry as Diorama).id));
  const allIds = new Set(stored.map((t) => idOf(t.entry)).filter((id): id is string => id !== undefined));
  const invalidOnlyIds = [...allIds].filter((id) => id.length > 0 && !validIds.has(id));

  const ops: Array<fc.Arbitrary<Op>> = [
    arbDraftBody.map((draft): Op => ({ kind: 'upsertNew', draft })),
    fc.tuple(fc.string({ minLength: 1, maxLength: 21 }), arbDraftBody).map(([seed, draft]): Op => {
      let id = seed;
      while (allIds.has(id)) id += '~';
      return { kind: 'upsertMissingId', id, draft };
    }),
  ];
  if (validIdx.length > 0) {
    const target = fc.constantFrom(...validIdx);
    ops.push(
      fc.tuple(target, arbDraftBody).map(([t, draft]): Op => ({ kind: 'upsertExisting', target: t, draft })),
      fc.tuple(target, arbName).map(([t, name]): Op => ({ kind: 'rename', target: t, name })),
      target.map((t): Op => ({ kind: 'remove', target: t })),
    );
  }
  if (invalidOnlyIds.length > 0) {
    ops.push(
      fc
        .tuple(fc.constantFrom(...invalidOnlyIds), arbDraftBody)
        .map(([id, draft]): Op => ({ kind: 'upsertInvalidId', id, draft })),
    );
  }
  return fc.record({
    stored: fc.constant(stored),
    op: fc.oneof(...ops),
    nowMs: fc.integer({ min: 0, max: MAX_ISO_MS }),
  });
});

/** The diorama an upsert of `draft` under `id` should store. */
function expectedUpsert(
  draft: Omit<DioramaDraft, 'id'>,
  id: string,
  createdAt: string,
  updatedAt: string,
): unknown {
  const d: Record<string, unknown> = {
    id,
    name: draft.name,
    setting: draft.setting,
    startFacing: draft.startFacing,
    pieces: draft.pieces,
    createdAt,
    updatedAt,
  };
  if (typeof draft.thumbnail === 'string') d.thumbnail = draft.thumbnail;
  return json(d);
}

describe('Property 28: Writes touch only their own entry', () => {
  it('changes only the target entry and leaves every other entry and key unchanged', () => {
    fc.assert(
      fc.property(arbCase, ({ stored, op, nowMs }) => {
        const rawFile = JSON.stringify({ version: 1, dioramas: stored.map((t) => t.entry) });
        const mem = memoryStorage({ ...OTHER_KEYS, [SAVE_KEY]: rawFile });
        const writes: string[] = [];
        const storage: KeyValueStorage = {
          getItem: (k) => mem.getItem(k),
          keys: () => mem.keys(),
          setItem: (k, v) => {
            writes.push(k);
            mem.setItem(k, v);
          },
        };
        const warnings: unknown[] = [];
        let nextId = 0;
        const repo = createSaveRepository({
          storage,
          now: () => new Date(nowMs),
          newId: () => `fresh-${nextId++}`,
          warn: (m) => void warnings.push(m),
        });

        const before = (JSON.parse(rawFile) as { dioramas: unknown[] }).dioramas;
        const beforeIds = new Set(before.map(idOf));
        const nowIso = new Date(nowMs).toISOString();

        const result =
          op.kind === 'upsertNew'
            ? repo.upsert({ ...op.draft, id: null })
            : op.kind === 'upsertExisting'
              ? repo.upsert({ ...op.draft, id: (stored[op.target].entry as Diorama).id })
              : op.kind === 'upsertInvalidId' || op.kind === 'upsertMissingId'
                ? repo.upsert({ ...op.draft, id: op.id })
                : op.kind === 'rename'
                  ? repo.rename((stored[op.target].entry as Diorama).id, op.name)
                  : repo.remove((stored[op.target].entry as Diorama).id);

        expect(result).toMatchObject({ ok: true });
        if (!result.ok) return;
        const written = result.diorama;

        // Exactly one write, to the SaveFile key; every other key is untouched.
        expect(writes).toStrictEqual([SAVE_KEY]);
        expect(warnings).toStrictEqual([]);
        expect(new Set(mem.keys())).toStrictEqual(new Set([...Object.keys(OTHER_KEYS), SAVE_KEY]));
        for (const [k, v] of Object.entries(OTHER_KEYS)) expect(mem.getItem(k)).toBe(v);

        const file = JSON.parse(mem.getItem(SAVE_KEY) as string) as Record<string, unknown>;
        expect(Object.keys(file).sort()).toStrictEqual(['dioramas', 'version']);
        expect(file.version).toBe(1);
        const after = file.dioramas as unknown[];

        // Position of the target entry in `after`, and the expected sequence of tags afterwards.
        let target: number | null;
        let afterValid: boolean[];
        const beforeValid = stored.map((t) => t.valid);

        if (op.kind === 'remove') {
          target = null;
          const expected = before.filter((_, i) => i !== op.target);
          expect(after).toStrictEqual(expected);
          expect(json(written)).toStrictEqual(before[op.target]);
          afterValid = beforeValid.filter((_, i) => i !== op.target);
        } else {
          let index: number;
          let expectedEntry: unknown;
          switch (op.kind) {
            case 'upsertNew': {
              index = before.length;
              expect(beforeIds.has(written.id)).toBe(false);
              expect(written.id.length).toBeGreaterThan(0);
              expectedEntry = expectedUpsert(op.draft, written.id, nowIso, nowIso);
              break;
            }
            case 'upsertMissingId': {
              index = before.length;
              expectedEntry = expectedUpsert(op.draft, op.id, op.draft.createdAt ?? nowIso, written.updatedAt);
              break;
            }
            case 'upsertInvalidId': {
              index = before.findIndex((e) => idOf(e) === op.id);
              expectedEntry = expectedUpsert(op.draft, op.id, op.draft.createdAt ?? nowIso, written.updatedAt);
              break;
            }
            case 'upsertExisting': {
              index = op.target;
              const stored0 = stored[op.target].entry as Diorama;
              expectedEntry = expectedUpsert(op.draft, stored0.id, stored0.createdAt, written.updatedAt);
              break;
            }
            case 'rename': {
              index = op.target;
              const stored0 = before[op.target] as Record<string, unknown>;
              expectedEntry = { ...stored0, name: op.name.trim(), updatedAt: written.updatedAt };
              break;
            }
          }
          target = index;
          const appended = index === before.length;
          expect(after).toHaveLength(appended ? before.length + 1 : before.length);
          expect(after[index]).toStrictEqual(expectedEntry);
          expect(json(written)).toStrictEqual(after[index]);
          // Every other entry, valid or invalid, is unchanged and in the same position.
          const others = after.filter((_, i) => i !== index);
          const beforeOthers = appended ? before : before.filter((_, i) => i !== index);
          expect(others).toStrictEqual(beforeOthers);
          afterValid = appended ? [...beforeValid, true] : beforeValid.map((v, i) => (i === index ? true : v));
        }

        // Exactly one valid entry per saved id: the written id has one valid entry
        // after an upsert or rename, and none after a remove.
        const validWithId = after.filter((e, i) => afterValid[i] && idOf(e) === written.id).length;
        expect(validWithId).toBe(op.kind === 'remove' ? 0 : 1);
        if (target !== null) expect(idOf(after[target])).toBe(written.id);
      }),
      { numRuns: 100 },
    );
  });
});
