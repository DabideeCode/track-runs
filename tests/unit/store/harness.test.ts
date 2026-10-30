import { afterEach, describe, expect, it } from 'vitest';
import { TOAST_MS, TOAST_SAVED, TOAST_SAVE_FAILED } from '@/store/createAppStore';
import type { Diorama } from '@/domain/types';
import { FAKE_THUMBNAIL, HARNESS_START, createHarness, disposeHarnesses, manualClock } from './harness';

afterEach(disposeHarnesses);

const saved: Diorama = {
  id: 'saved1',
  name: 'Loop',
  setting: 'kitchen',
  startFacing: 0,
  pieces: [{ id: 's', type: 'station', gridX: 3, gridZ: 3, rotation: 0 }],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-02T08:00:00.000Z',
};

describe('clock and timers', () => {
  it('fires timeouts and intervals in time order, then stops at the target time', () => {
    const c = manualClock(0);
    const fired: string[] = [];
    c.timers.setTimeout(() => fired.push('t250'), 250);
    c.timers.setInterval(() => fired.push(`i@${c.now}`), 100);
    c.timers.setTimeout(() => fired.push('t100'), 100);
    c.advance(300);
    expect(fired).toEqual(['i@100', 't100', 'i@200', 't250', 'i@300']);
    expect(c.now).toBe(300);
    expect(c.pendingTimers()).toBe(1);
  });

  it('runs the autosave and toast timers of the store', () => {
    const h = createHarness({ start: 'playfield' });
    expect(h.clock.now).toBe(HARNESS_START);
    h.store.getState().placePiece('house', 2, 2);
    h.clock.advance(29_000);
    expect(h.stored()).toEqual([]);
    h.clock.advance(2_000);
    expect(h.stored()).toHaveLength(1);
    expect(h.store.getState().toasts.map((t) => t.text)).toEqual([TOAST_SAVED]);
    h.clock.advance(TOAST_MS);
    expect(h.store.getState().toasts).toEqual([]);
  });

  it('dispose clears the store timers', () => {
    const h = createHarness();
    expect(h.clock.pendingTimers()).toBeGreaterThan(0);
    h.dispose();
    expect(h.clock.pendingTimers()).toBe(0);
  });
});

describe('seeded ids', () => {
  const run = (prefix?: string) => {
    const h = createHarness({ start: 'playfield', ...(prefix ? { idPrefix: prefix } : {}) });
    const s = h.store.getState();
    s.placePiece('station', 4, 4);
    s.placePiece('straight', 4, 5);
    s.placePiece('house', 10, 10);
    s.save();
    return h;
  };

  it('two harnesses with the same options produce identical ids and states', () => {
    const a = run();
    const b = run();
    expect(a.store.getState().pieces.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(b.store.getState().pieces).toEqual(a.store.getState().pieces);
    expect(b.stored()).toEqual(a.stored());
    expect(a.stored()[0]?.id).toBe('d1');
    expect(b.audio.getLog()).toEqual(a.audio.getLog());
  });

  it('uses the configured prefix', () => {
    expect(run('q').ids.issued()).toEqual(['q1', 'q2', 'q3']);
  });
});

describe('fake scene', () => {
  it.each([
    ['ok', FAKE_THUMBNAIL],
    ['null', undefined],
    ['throw', undefined],
  ] as const)('thumbnail mode %s', (mode, expected) => {
    const h = createHarness({ start: 'playfield' });
    h.scene.setThumbnailMode(mode);
    h.store.getState().placePiece('house', 1, 1);
    expect(h.store.getState().save()).toBe(true);
    expect(h.scene.captures).toBe(1);
    expect(h.stored()[0]?.thumbnail).toBe(expected);
  });
});

describe('storage options', () => {
  it('seeds saved dioramas and can start with one opened', () => {
    const h = createHarness({ saved: [saved], start: { open: 'saved1' } });
    expect(h.store.getState()).toMatchObject({ screen: 'playfield', dioramaId: 'saved1', setting: 'kitchen' });
  });

  it('failWrites makes saves fail until switched off', () => {
    const h = createHarness({ start: 'playfield', failWrites: true });
    h.store.getState().placePiece('house', 1, 1);
    expect(h.store.getState().save()).toBe(false);
    expect(h.store.getState().toasts.map((t) => t.text)).toEqual([TOAST_SAVE_FAILED]);
    h.storage.setFailWrites(false);
    expect(h.store.getState().save()).toBe(true);
  });
});

describe('train runtime', () => {
  it('snapshot follows the store pieces in Build mode', () => {
    const h = createHarness({ start: 'playfield' });
    expect(h.getTrain()).toBeNull();
    const r = h.store.getState().placePiece('station', 5, 5);
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id : '';
    expect(h.getTrain()).toMatchObject({ pieceId: id, progress: 0.5, moving: false, speed: 0 });
    h.store.getState().removePiece(id);
    expect(h.getTrain()).toBeNull();
  });

  it('Play mode starts the real train; tick moves it and logs train sounds', () => {
    const h = createHarness({ start: 'playfield' });
    h.store.getState().placePiece('station', 5, 5);
    h.store.getState().placePiece('straight', 5, 4, { rotation: 0 });
    h.store.getState().placePiece('straight', 5, 6, { rotation: 0 });
    h.audio.clearLog();
    expect(h.store.getState().setMode('play')).toEqual({ ok: true });
    expect(h.trainCalls.map((c) => c.method)).toContain('enterPlay');
    expect(h.audio.getLog()).toEqual(['whistle', 'chug']);
    expect(h.audio.chugRunning).toBe(true);
    for (let i = 0; i < 20; i++) h.tick(1 / 60);
    const t = h.getTrain();
    expect(t?.moving).toBe(true);
    expect(t?.speed).toBeGreaterThan(0);
    h.store.getState().setMode('build');
    expect(h.audio.chugRunning).toBe(false);
    expect(h.getTrain()).toMatchObject({ progress: 0.5, moving: false });
  });
});
