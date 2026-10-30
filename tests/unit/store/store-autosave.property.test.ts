// Feature: track-diorama-builder, Property 33: Autosave fires 30 seconds after its trigger
/**
 * **Validates: Requirements 23.1, 23.4, 23.5**
 *
 * Property 33: *For any* timeline of dirtying actions, saves, autosave
 * attempts (succeeding or failing) and mode switches, an autosave write
 * happens only in Build mode while dirty, and each one happens between 30 and
 * 31 seconds after the latest of: `isDirty` changing to true, the previous
 * autosave attempt, or the latest return to Build mode.
 *
 * Setup: a real store (`createHarness`) whose clock only moves in `advance`
 * steps. The storage's `failWrites` hook is used as an observer: every write
 * to `wooden-diorama:v1` made while the clock is advancing is an autosave
 * attempt (nothing else runs during an advance), and the observer records its
 * time and the store's mode, dirty flag and screen at that moment. The same
 * hook makes writes fail while the timeline has failures switched on.
 *
 * The test keeps its own model of the latest trigger, observed only from the
 * outside: the moment `isDirty` turned from false to true, the moment
 * Build mode was re-entered from Play mode, and the time of each recorded
 * autosave attempt (successful or failed). Manual saves and the
 * unsaved-changes dialog's Save are not autosave attempts, so they are not
 * triggers.
 *
 * Checks:
 * - every autosave attempt happens on the playfield, in Build mode, while
 *   dirty (Requirement 23.5), 30 to 31 seconds after the model's latest
 *   trigger (Requirements 23.1, 23.4);
 * - the autosave does fire: after any step, if the playfield is in Build mode
 *   and dirty, at most 31 seconds have passed since the latest trigger
 *   (otherwise a due autosave was missed).
 *
 * Coverage: the explicit example timeline guarantees a successful autosave, a
 * failed one followed by its retry, a dirty Play-mode stretch longer than
 * 31 seconds with no write, and an autosave timed from a return to Build
 * mode, so the coverage assertions after the run never depend on the seed.
 */
import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTOSAVE_MS } from '@/domain/autosave';
import type { PieceType } from '@/domain/types';
import { SAVE_KEY } from '@/persistence/saveRepository';
import { createHarness, disposeHarnesses, type Harness, type ThumbnailMode } from './harness';

afterEach(() => disposeHarnesses());

/** The ±1 second tolerance of Requirement 23.1. */
const TOLERANCE_MS = 1_000;

// ---------------------------------------------------------------------------
// Timeline steps
// ---------------------------------------------------------------------------

type Step =
  | { k: 'place'; type: PieceType; x: number; z: number }
  | { k: 'station'; start: number }
  | { k: 'setting' }
  | { k: 'flip' }
  | { k: 'undo' }
  | { k: 'redo' }
  | { k: 'remove'; pick: number }
  | { k: 'save' }
  | { k: 'fail'; on: boolean }
  | { k: 'thumb'; mode: ThumbnailMode }
  | { k: 'play' }
  | { k: 'build' }
  | { k: 'advance'; ms: number }
  | { k: 'menu'; then: 'save' | 'discard' | 'cancel' }
  | { k: 'new' }
  | { k: 'open'; pick: number };

const arbAdvanceMs = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 2_000 }) },
  { weight: 2, arbitrary: fc.integer({ min: 2_000, max: 15_000 }) },
  // Around the 30 s mark, so attempts land on both sides of the window edges.
  { weight: 3, arbitrary: fc.integer({ min: 28_000, max: 32_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 32_000, max: 70_000 }) },
);

const arbStep: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      k: fc.constant('place' as const),
      type: fc.constantFrom<PieceType>('straight', 'curve', 'buffer', 'house', 'pineTree', 'hill', 'blocks'),
      x: fc.integer({ min: 0, max: 15 }),
      z: fc.integer({ min: 0, max: 15 }),
    }),
  },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('station' as const), start: fc.nat({ max: 255 }) }) },
  { weight: 1, arbitrary: fc.constant<Step>({ k: 'setting' }) },
  { weight: 1, arbitrary: fc.constant<Step>({ k: 'flip' }) },
  { weight: 1, arbitrary: fc.constant<Step>({ k: 'undo' }) },
  { weight: 1, arbitrary: fc.constant<Step>({ k: 'redo' }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('remove' as const), pick: fc.nat() }) },
  { weight: 1, arbitrary: fc.constant<Step>({ k: 'save' }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('fail' as const), on: fc.boolean() }) },
  {
    weight: 1,
    arbitrary: fc.record({ k: fc.constant('thumb' as const), mode: fc.constantFrom<ThumbnailMode>('ok', 'null', 'throw') }),
  },
  { weight: 2, arbitrary: fc.constant<Step>({ k: 'play' }) },
  { weight: 2, arbitrary: fc.constant<Step>({ k: 'build' }) },
  { weight: 7, arbitrary: fc.record({ k: fc.constant('advance' as const), ms: arbAdvanceMs }) },
  {
    weight: 1,
    arbitrary: fc.record({
      k: fc.constant('menu' as const),
      then: fc.constantFrom<'save' | 'discard' | 'cancel'>('save', 'discard', 'cancel'),
    }),
  },
  { weight: 1, arbitrary: fc.constant<Step>({ k: 'new' }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('open' as const), pick: fc.nat() }) },
);

/** A fixed timeline that exercises every case the coverage assertions need. */
const COVERAGE_TIMELINE: Step[] = [
  { k: 'station', start: 0 }, // dirty: trigger on a check tick
  { k: 'advance', ms: 500 },
  { k: 'place', type: 'straight', x: 5, z: 5 }, // already dirty: no new trigger
  { k: 'advance', ms: 30_600 }, // successful autosave 30 s after the first change
  { k: 'advance', ms: 1_234 },
  { k: 'setting' }, // dirty again, between check ticks
  { k: 'fail', on: true },
  { k: 'advance', ms: 31_000 }, // failed autosave
  { k: 'advance', ms: 31_000 }, // retry 30 s after the failed attempt, fails again
  { k: 'fail', on: false },
  { k: 'play' },
  { k: 'advance', ms: 45_000 }, // dirty in Play mode: no write at all
  { k: 'build' }, // return to Build mode restarts the wait
  { k: 'advance', ms: 31_000 }, // successful autosave timed from the return
];

// ---------------------------------------------------------------------------
// Model and checks
// ---------------------------------------------------------------------------

type TriggerKind = 'dirtied' | 'attempt-ok' | 'attempt-failed' | 'returnedToBuild';

interface Attempt {
  t: number;
  mode: string;
  isDirty: boolean;
  screen: string;
  failed: boolean;
}

/** Totals across all runs, for the coverage assertions. */
const coverage = {
  succeeded: 0,
  failed: 0,
  retriesAfterFailure: 0,
  afterReturnToBuild: 0,
  dirtyPlayWithoutWrite: 0,
};

function runTimeline(startOnMenu: boolean, steps: readonly Step[]): void {
  const h: Harness = createHarness({ start: startOnMenu ? 'menu' : 'playfield' });
  let failing = false;
  let advancing = false;
  let attempts: Attempt[] = [];
  let lastTrigger: { t: number; kind: TriggerKind } | null = null;

  // Observer and failure switch in one: it must never throw anything but the
  // intended failure, so all checks happen after the advance.
  h.storage.setFailWrites((key) => {
    if (advancing && key === SAVE_KEY) {
      const s = h.store.getState();
      attempts.push({ t: h.clock.now, mode: s.mode, isDirty: s.isDirty, screen: s.screen, failed: failing });
    }
    return failing;
  });

  try {
    for (const [index, step] of steps.entries()) {
      const label = `step ${index} ${JSON.stringify(step)}`;
      const before = h.store.getState();
      const wasDirty = before.isDirty;
      const wasMode = before.mode;
      const s = h.store.getState();

      switch (step.k) {
        case 'place':
          s.placePiece(step.type, step.x, step.z);
          break;
        case 'station': {
          for (let i = 0; i < 256; i++) {
            const t = (step.start + i) % 256;
            const r = h.store.getState().placePiece('station', t % 16, Math.floor(t / 16));
            if (r.ok || r.reason !== 'occupied') break;
          }
          break;
        }
        case 'setting':
          s.setSetting(s.setting === 'bedroom' ? 'kitchen' : 'bedroom');
          break;
        case 'flip':
          s.flipStartFacing();
          break;
        case 'undo':
          s.undo();
          break;
        case 'redo':
          s.redo();
          break;
        case 'remove':
          if (s.pieces.length > 0) s.removePiece(s.pieces[step.pick % s.pieces.length]!.id);
          break;
        case 'save':
          s.save('manual');
          break;
        case 'fail':
          failing = step.on;
          break;
        case 'thumb':
          h.scene.setThumbnailMode(step.mode);
          break;
        case 'play':
          s.setMode('play');
          break;
        case 'build':
          s.setMode('build');
          break;
        case 'menu':
          s.backToMenu();
          if (h.store.getState().dialog?.kind === 'unsaved') {
            const st = h.store.getState();
            if (step.then === 'save') st.confirmDialog();
            else if (step.then === 'discard') st.discardAndLeave();
            else st.cancelDialog();
          }
          break;
        case 'new':
          if (s.screen === 'menu') s.newDiorama();
          break;
        case 'open': {
          const list = h.saves.list();
          if (s.screen === 'menu' && list.length > 0) s.openDiorama(list[step.pick % list.length]!.id);
          break;
        }
        case 'advance': {
          const startT = h.clock.now;
          const dirtyPlay = before.screen === 'playfield' && before.mode === 'play' && before.isDirty;
          attempts = [];
          advancing = true;
          try {
            h.clock.advance(step.ms);
          } finally {
            advancing = false;
          }
          for (const a of attempts) {
            // Requirement 23.5: autosave writes only in Build mode while dirty.
            expect(a.screen, `${label}: autosave outside the playfield`).toBe('playfield');
            expect(a.mode, `${label}: autosave in Play mode`).toBe('build');
            expect(a.isDirty, `${label}: autosave while clean`).toBe(true);
            // Requirements 23.1, 23.4: 30 s (±1 s) after the latest trigger.
            expect(lastTrigger, `${label}: autosave with no trigger`).not.toBeNull();
            const delta = a.t - lastTrigger!.t;
            expect(delta, `${label}: autosave ${delta} ms after its ${lastTrigger!.kind} trigger`).toBeGreaterThanOrEqual(
              AUTOSAVE_MS,
            );
            expect(delta, `${label}: autosave ${delta} ms after its ${lastTrigger!.kind} trigger`).toBeLessThanOrEqual(
              AUTOSAVE_MS + TOLERANCE_MS,
            );
            if (lastTrigger!.kind === 'attempt-failed') coverage.retriesAfterFailure++;
            if (lastTrigger!.kind === 'returnedToBuild') coverage.afterReturnToBuild++;
            if (a.failed) coverage.failed++;
            else coverage.succeeded++;
            lastTrigger = { t: a.t, kind: a.failed ? 'attempt-failed' : 'attempt-ok' };
          }
          if (dirtyPlay && attempts.length === 0 && lastTrigger !== null && h.clock.now - lastTrigger.t > AUTOSAVE_MS + TOLERANCE_MS) {
            coverage.dirtyPlayWithoutWrite++;
          }
          expect(h.clock.now).toBe(startT + step.ms);
          break;
        }
      }

      if (step.k !== 'advance') {
        const after = h.store.getState();
        if (!wasDirty && after.isDirty) lastTrigger = { t: h.clock.now, kind: 'dirtied' };
        if (wasMode === 'play' && after.mode === 'build' && after.screen === 'playfield' && step.k === 'build') {
          lastTrigger = { t: h.clock.now, kind: 'returnedToBuild' };
        }
      }

      // The autosave is not missed: a dirty Build-mode playfield never waits
      // more than 31 s past its latest trigger.
      const now = h.store.getState();
      if (now.screen === 'playfield' && now.mode === 'build' && now.isDirty) {
        expect(lastTrigger, `${label}: dirty with no observed trigger`).not.toBeNull();
        expect(
          h.clock.now - lastTrigger!.t,
          `${label}: no autosave ${h.clock.now - lastTrigger!.t} ms after the ${lastTrigger!.kind} trigger`,
        ).toBeLessThanOrEqual(AUTOSAVE_MS + TOLERANCE_MS);
      }
    }
  } finally {
    h.dispose();
  }
}

describe('Property 33: Autosave fires 30 seconds after its trigger', () => {
  it('writes only in Build mode while dirty, 30 to 31 s after the latest trigger, and never misses one', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.array(arbStep, { minLength: 1, maxLength: 40 }), (startOnMenu, steps) => {
        runTimeline(startOnMenu, steps);
      }),
      { numRuns: 100, examples: [[false, COVERAGE_TIMELINE]] },
    );

    // The example timeline guarantees each of these, whatever the seed.
    expect(coverage.succeeded).toBeGreaterThan(0);
    expect(coverage.failed).toBeGreaterThan(0);
    expect(coverage.retriesAfterFailure).toBeGreaterThan(0);
    expect(coverage.afterReturnToBuild).toBeGreaterThan(0);
    expect(coverage.dirtyPlayWithoutWrite).toBeGreaterThan(0);
  });
});
