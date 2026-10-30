/**
 * Playfield chunk loader (task 17.2, D-59; Requirement 32.6).
 */
import { describe, expect, it, vi } from 'vitest';
import { createPlayfieldLoader, whenIdle, type PlayfieldModule } from '@/ui/playfieldLoader';

const MODULE: PlayfieldModule = { default: () => null };

describe('createPlayfieldLoader', () => {
  it('shares one import between prefetch, load and the lazy component', async () => {
    const importModule = vi.fn(() => Promise.resolve(MODULE));
    const loader = createPlayfieldLoader(importModule);
    loader.prefetch();
    const a = loader.load();
    const b = loader.load();
    expect(a).toBe(b);
    await expect(a).resolves.toBe(MODULE);
    expect(importModule).toHaveBeenCalledTimes(1);
    expect(loader.component()).toBe(loader.component());
    // The finished import carries the thenable fields React reads.
    expect(a).toMatchObject({ status: 'fulfilled', value: MODULE });
  });

  it('a failed prefetch warns, throws nothing and lets the next load retry', async () => {
    const error = new Error('chunk failed');
    const importModule = vi.fn<() => Promise<PlayfieldModule>>().mockRejectedValueOnce(error).mockResolvedValue(MODULE);
    const warn = vi.fn();
    const loader = createPlayfieldLoader(importModule, warn);
    loader.prefetch();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('prefetched'), error));
    await expect(loader.load()).resolves.toBe(MODULE);
    expect(importModule).toHaveBeenCalledTimes(2);
  });

  it('a loader that throws synchronously is reported as a rejected load', async () => {
    const loader = createPlayfieldLoader(() => {
      throw new Error('boom');
    });
    await expect(loader.load()).rejects.toThrow('boom');
  });
  // A new lazy component after a failed load is checked through React in
  // tests/component/App.test.tsx ("Try again" after a chunk load failure).
});

describe('whenIdle', () => {
  it('uses requestIdleCallback when present and can cancel it', () => {
    const task = vi.fn();
    const requestIdleCallback = vi.fn((cb: () => void) => {
      cb();
      return 7;
    });
    const cancelIdleCallback = vi.fn();
    const cancel = whenIdle(task, { requestIdleCallback, cancelIdleCallback, setTimeout, clearTimeout });
    expect(task).toHaveBeenCalledTimes(1);
    cancel();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('falls back to a timeout and can cancel it', () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn();
      whenIdle(task, { setTimeout, clearTimeout });
      vi.advanceTimersByTime(250);
      expect(task).toHaveBeenCalledTimes(1);

      const other = vi.fn();
      const cancel = whenIdle(other, { setTimeout, clearTimeout });
      cancel();
      vi.advanceTimersByTime(1000);
      expect(other).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
