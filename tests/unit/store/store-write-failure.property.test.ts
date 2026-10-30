// Feature: track-diorama-builder, Property 30: Failed writes leave storage untouched
/**
 * **Validates: Requirements 5.9, 22.11, 36.7**
 *
 * Property 30: *For any* prior value under `wooden-diorama:v1` and any save,
 * rename or remove whose storage write throws, the stored value is
 * byte-for-byte unchanged afterwards, the store keeps `isDirty` true for a
 * save, and a toast reporting the failure is shown.
 *
 * Setup: a real store (`createHarness`) on a `memoryStorage` seeded with a
 * random prior value under `wooden-diorama:v1`: missing, a SaveFile mixing
 * valid and invalid entries (sometimes pretty-printed, so any rewrite would
 * change the bytes), or a corrupt string. Other keys (audio settings, an old
 * corrupt backup) are sometimes present too.
 *
 * Steps: a random sequence of store operations, each with a random failure
 * mode for the storage writes it makes:
 * - `all`: every write throws `QuotaExceededError`;
 * - `mainKey`: only writes to `wooden-diorama:v1` throw (a corrupt-data backup
 *   is written first, then the main write fails);
 * - `firstCall`: only the operation's first write throws (the backup for a
 *   corrupt file, otherwise the main write);
 * - `none`: no failure, so later steps meet varied stored values and states.
 *
 * Operations go through the store exactly as the UI does: manual save
 * (`save('manual')`), autosave (the store's own 30 s timer, driven by the
 * harness clock), the unsaved-changes dialog's Save (`backToMenu` then
 * `confirmDialog`), rename (`renameDiorama`), delete (`requestDeleteDiorama`
 * then `confirmDialog`) and New diorama (which reads only, so it must not
 * write at all). Before each save the diorama is made dirty by a placement,
 * a setting change or a start-facing flip.
 *
 * For each failed operation the test checks: the raw value under
 * `wooden-diorama:v1` is identical (including staying missing); every other
 * key that existed is identical; the only new key allowed is a fresh
 * `wooden-diorama:v1:corrupt-…` backup holding the exact prior raw string
 * (Requirement 24.3 backs up before replacing; it does not touch the main
 * key). For saves the store keeps `isDirty` true and every change intact on
 * the open playfield, with the "Save failed" error toast. For rename and
 * delete the menu list is unchanged, with the matching error toast.
 *
 * Finally, with failures switched off, a save and a rename succeed and are
 * stored, so a failure leaves nothing stuck.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseSaveFile } from '@/domain/saveFormat';
import type { Diorama, PieceType } from '@/domain/types';
import { CORRUPT_BACKUP_PREFIX, SAVE_KEY } from '@/persistence/saveRepository';
import type { MemoryStorage } from '@/persistence/storage';
import {
  TOAST_DELETE_FAILED,
  TOAST_RENAME_FAILED,
  TOAST_SAVED,
  TOAST_SAVE_FAILED,
} from '@/store/createAppStore';
import { createHarness, disposeHarnesses, type Harness } from './harness';
import { arbDiorama, arbInvalidEntry, arbSaveFile } from '../persistence/arbitraries';

afterEach(() => disposeHarnesses());

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Prior raw value under `wooden-diorama:v1`; null means the key is missing. */
const arbPriorMain: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  // A SaveFile mixing valid and invalid entries, compact or pretty-printed.
  {
    weight: 5,
    arbitrary: fc
      .tuple(
        fc.array(
          fc.oneof({ weight: 3, arbitrary: arbDiorama as fc.Arbitrary<unknown> }, { weight: 1, arbitrary: arbInvalidEntry }),
          { maxLength: 5 },
        ),
        fc.constantFrom(undefined, 2),
      )
      .map(([dioramas, indent]) => JSON.stringify({ version: 1, dioramas }, null, indent)),
  },
  // Corrupt values: not JSON, the wrong shape or version, or truncated JSON.
  {
    weight: 2,
    arbitrary: fc.oneof(
      fc.constantFrom('', 'not json', '{"version":2,"dioramas":[]}', '[]', 'null', '{"version":1}'),
      fc.string({ maxLength: 30 }),
      arbSaveFile(2).chain((file) => {
        const json = JSON.stringify(file);
        return fc.integer({ min: 1, max: Math.max(1, json.length - 1) }).map((n) => json.slice(0, n));
      }),
    ),
  },
);

/** Other keys that may already exist; failed writes must not touch them either. */
const arbOtherKeys: fc.Arbitrary<Record<string, string>> = fc.record(
  {
    'wooden-diorama:audio': fc.constantFrom('{"muted":false,"musicVolume":0.3,"sfxVolume":0.9}', 'garbage'),
    'wooden-diorama:settings': fc.constant('{"lowQuality":true}'),
    [`${CORRUPT_BACKUP_PREFIX}2026-10-29T10:00:00.000Z`]: fc.constant('old corrupt data'),
  },
  { requiredKeys: [] },
);

type Op = 'save' | 'autosave' | 'dialogSave' | 'rename' | 'delete' | 'newDiorama';
type FailMode = 'none' | 'all' | 'mainKey' | 'firstCall';
type Dirt = 'place' | 'setting' | 'facing';

interface Step {
  op: Op;
  fail: FailMode;
  /** Chooses which saved diorama to open, rename or delete, and whether to open one or start new. */
  pick: number;
  dirt: Dirt;
  placeType: PieceType;
  tileStart: number;
  name: string;
}

const arbStep: fc.Arbitrary<Step> = fc.record({
  op: fc.constantFrom<Op>('save', 'autosave', 'dialogSave', 'rename', 'delete', 'newDiorama'),
  fail: fc.oneof(
    { weight: 1, arbitrary: fc.constant<FailMode>('none') },
    { weight: 3, arbitrary: fc.constantFrom<FailMode>('all', 'mainKey', 'firstCall') },
  ),
  pick: fc.nat(),
  dirt: fc.constantFrom<Dirt>('place', 'setting', 'facing'),
  placeType: fc.constantFrom<PieceType>('house', 'straight', 'curve', 'blocks', 'hill'),
  tileStart: fc.nat({ max: 255 }),
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Arms the failure mode; returns the keys of every write attempted from now on. */
function arm(storage: MemoryStorage, mode: FailMode): string[] {
  const attempts: string[] = [];
  storage.setFailWrites((key) => {
    const index = attempts.length;
    attempts.push(key);
    switch (mode) {
      case 'none':
        return false;
      case 'all':
        return true;
      case 'mainKey':
        return key === SAVE_KEY;
      case 'firstCall':
        return index === 0;
    }
  });
  return attempts;
}

function snapshotStorage(storage: MemoryStorage): Map<string, string> {
  const out = new Map<string, string>();
  for (const k of storage.keys()) out.set(k, storage.getItem(k) as string);
  return out;
}

/** Storage after a failed write: main key identical, old keys identical, only a fresh backup of the prior value may appear. */
function expectStorageUntouched(storage: MemoryStorage, before: Map<string, string>): void {
  const priorMain = before.has(SAVE_KEY) ? (before.get(SAVE_KEY) as string) : null;
  expect(storage.getItem(SAVE_KEY)).toBe(priorMain);
  for (const [k, v] of before) expect(storage.getItem(k)).toBe(v);
  for (const k of storage.keys()) {
    if (before.has(k)) continue;
    expect(k.startsWith(CORRUPT_BACKUP_PREFIX)).toBe(true);
    expect(priorMain).not.toBeNull();
    expect(parseSaveFile(priorMain).status).toBe('corrupt');
    expect(storage.getItem(k)).toBe(priorMain);
  }
}

function lastToast(h: Harness): { text: string; tone: string } | undefined {
  const toasts = h.store.getState().toasts;
  const t = toasts[toasts.length - 1];
  return t && { text: t.text, tone: t.tone };
}

function ensureMenu(h: Harness): void {
  const s = h.store.getState();
  if (s.screen === 'menu') return;
  s.backToMenu();
  if (h.store.getState().dialog?.kind === 'unsaved') h.store.getState().discardAndLeave();
  expect(h.store.getState().screen).toBe('menu');
}

function ensurePlayfield(h: Harness, pick: number): void {
  const s = h.store.getState();
  if (s.screen === 'playfield') return;
  const list = s.savedList;
  if (list.length > 0 && pick % 2 === 0) {
    expect(s.openDiorama(list[pick % list.length].id)).toBe(true);
  } else {
    s.newDiorama();
  }
  expect(h.store.getState().screen).toBe('playfield');
}

/** Makes an actual change, so the diorama is dirty (Requirement 35.4). */
function makeDirty(h: Harness, step: Step): void {
  const s = h.store.getState();
  let changed = false;
  if (step.dirt === 'place') {
    for (let i = 0; i < 256 && !changed; i++) {
      const t = (step.tileStart + i) % 256;
      changed = s.placePiece(step.placeType, t % 16, Math.floor(t / 16)).ok;
    }
  } else if (step.dirt === 'facing') {
    changed = s.flipStartFacing();
  }
  if (!changed) changed = s.setSetting(s.setting === 'bedroom' ? 'kitchen' : 'bedroom');
  expect(changed).toBe(true);
  expect(h.store.getState().isDirty).toBe(true);
}

/** The editor fields a failed save must keep intact (Requirement 22.11). */
function editorView(h: Harness) {
  const s = h.store.getState();
  return {
    screen: s.screen,
    mode: s.mode,
    pieces: s.pieces,
    setting: s.setting,
    startFacing: s.startFacing,
    dioramaId: s.dioramaId,
    dioramaName: s.dioramaName,
    isDirty: s.isDirty,
  };
}

/** Runs one step; checks Property 30 when its writes were made to fail. */
function runStep(h: Harness, step: Step): void {
  const failing = step.fail !== 'none';

  if (step.op === 'save' || step.op === 'autosave' || step.op === 'dialogSave') {
    ensurePlayfield(h, step.pick);
    makeDirty(h, step);
    const before = snapshotStorage(h.storage);
    const editor = structuredClone(editorView(h));
    const startTime = h.clock.now;
    const attempts = arm(h.storage, step.fail);

    let returned: boolean | null = null;
    if (step.op === 'save') {
      returned = h.store.getState().save('manual');
    } else if (step.op === 'dialogSave') {
      h.store.getState().backToMenu();
      expect(h.store.getState().dialog).toEqual({ kind: 'unsaved' });
      h.store.getState().confirmDialog();
    } else {
      // Drive the store's own timer second by second until it attempts a write.
      for (let i = 0; i < 31 && attempts.length === 0; i++) h.clock.advance(1_000);
      expect(h.clock.now - startTime).toBeLessThanOrEqual(31_000);
    }
    h.storage.setFailWrites(false);
    expect(attempts.length).toBeGreaterThan(0);

    if (!failing) {
      if (returned !== null) expect(returned).toBe(true);
      return;
    }
    if (returned !== null) expect(returned).toBe(false);
    expectStorageUntouched(h.storage, before);
    expect(editorView(h)).toEqual(editor);
    expect(h.store.getState().isDirty).toBe(true);
    expect(h.store.getState().screen).toBe('playfield');
    expect(h.store.getState().dialog).toBeNull();
    expect(lastToast(h)).toEqual({ text: TOAST_SAVE_FAILED, tone: 'error' });
    return;
  }

  ensureMenu(h);

  if (step.op === 'newDiorama') {
    const before = snapshotStorage(h.storage);
    const attempts = arm(h.storage, step.fail);
    h.store.getState().newDiorama();
    h.storage.setFailWrites(false);
    // Creating a diorama writes nothing (Requirement 4.7), failure or not.
    expect(attempts).toEqual([]);
    expectStorageUntouched(h.storage, before);
    expect(h.store.getState().screen).toBe('playfield');
    return;
  }

  const list = h.store.getState().savedList;
  if (list.length === 0) return;
  const target: Diorama = list[step.pick % list.length];
  const before = snapshotStorage(h.storage);
  const listBefore = structuredClone(list);
  const attempts = arm(h.storage, step.fail);

  let returned: boolean | null = null;
  if (step.op === 'rename') {
    h.store.getState().startRename(target.id);
    returned = h.store.getState().renameDiorama(target.id, step.name);
  } else {
    h.store.getState().requestDeleteDiorama(target.id);
    expect(h.store.getState().dialog).toEqual({ kind: 'deleteDiorama', id: target.id });
    h.store.getState().confirmDialog();
  }
  h.storage.setFailWrites(false);
  expect(attempts.length).toBeGreaterThan(0);

  if (!failing) {
    if (returned !== null) expect(returned).toBe(true);
    return;
  }
  if (returned !== null) expect(returned).toBe(false);
  expectStorageUntouched(h.storage, before);
  // The entry stays unchanged on screen (Requirement 5.9).
  expect(h.store.getState().savedList).toEqual(listBefore);
  expect(h.store.getState().screen).toBe('menu');
  expect(h.store.getState().dialog).toBeNull();
  expect(lastToast(h)).toEqual({
    text: step.op === 'rename' ? TOAST_RENAME_FAILED : TOAST_DELETE_FAILED,
    tone: 'error',
  });
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 30: Failed writes leave storage untouched', () => {
  it('keeps the stored value, isDirty and the open changes, and shows a failure toast', () => {
    fc.assert(
      fc.property(
        arbPriorMain,
        arbOtherKeys,
        fc.array(arbStep, { minLength: 1, maxLength: 6 }),
        arbStep,
        (priorMain, otherKeys, steps, finalStep) => {
          const storage: Record<string, string> = { ...otherKeys };
          if (priorMain !== null) storage[SAVE_KEY] = priorMain;
          const h = createHarness({ storage });
          try {
            h.store.getState().refreshList();
            for (const step of steps) runStep(h, step);

            // A later write succeeds once storage works again.
            ensurePlayfield(h, finalStep.pick);
            makeDirty(h, finalStep);
            expect(h.store.getState().save('manual')).toBe(true);
            const s = h.store.getState();
            expect(s.isDirty).toBe(false);
            expect(lastToast(h)).toEqual({ text: TOAST_SAVED, tone: 'success' });
            const parsed = parseSaveFile(h.storage.getItem(SAVE_KEY));
            expect(parsed.status).toBe('ok');
            const saved = parsed.status === 'ok' ? parsed.valid.find((d) => d.id === s.dioramaId) : undefined;
            expect(saved?.pieces).toEqual(s.pieces);

            ensureMenu(h);
            const id = s.dioramaId as string;
            expect(h.store.getState().renameDiorama(id, `  ${finalStep.name.trim()}  `)).toBe(true);
            expect(h.saves.get(id)?.name).toBe(finalStep.name.trim());
          } finally {
            h.dispose();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
