/**
 * FPS averaging and the perf-overlay flag (task 17.2, D-60; Requirement 32.1).
 */
import { describe, expect, it } from 'vitest';
import { FPS_WINDOW_MS, FpsMeter, formatFps, shouldShowPerfOverlay } from '@/ui/perfOverlayLogic';

function feed(meter: FpsMeter, fps: number, seconds: number, start = 0): number {
  const dt = 1000 / fps;
  const n = Math.round(seconds * fps);
  let t = start;
  for (let i = 0; i <= n; i++) {
    t = start + i * dt;
    meter.frame(t);
  }
  return t;
}

describe('FpsMeter', () => {
  it('reports nothing with fewer than two frames', () => {
    const meter = new FpsMeter();
    expect(meter.reading()).toEqual({ fps: null, spanMs: 0, frames: 0, complete: false });
    meter.frame(5);
    expect(meter.reading().fps).toBeNull();
  });

  it('averages a steady 60 fps and is complete after 10 seconds', () => {
    const meter = new FpsMeter();
    feed(meter, 60, 4);
    let r = meter.reading();
    expect(r.fps).toBeCloseTo(60, 6);
    expect(r.complete).toBe(false);
    expect(r.spanMs).toBeCloseTo(4000, 6);

    feed(meter, 60, 8, 4000 + 1000 / 60);
    r = meter.reading();
    expect(r.complete).toBe(true);
    expect(r.spanMs).toBeLessThanOrEqual(FPS_WINDOW_MS);
    expect(r.spanMs).toBeGreaterThanOrEqual(FPS_WINDOW_MS - 1000 / 60 - 1e-6);
    expect(r.fps).toBeCloseTo(60, 6);
  });

  it('forgets frames older than the window: 10 s at 20 fps after 10 s at 60 fps reads 20', () => {
    const meter = new FpsMeter();
    const end = feed(meter, 60, 10);
    feed(meter, 20, 10, end + 50);
    expect(meter.reading().fps).toBeCloseTo(20, 1);
  });

  it('a 10 s window with 5 s at 60 fps and 5 s at 30 fps averages 45 fps', () => {
    const meter = new FpsMeter();
    const end = feed(meter, 60, 5);
    feed(meter, 30, 5, end + 1000 / 30);
    expect(meter.reading().fps).toBeCloseTo(45, 0);
  });

  it('starts over when the clock goes backwards', () => {
    const meter = new FpsMeter();
    feed(meter, 60, 2, 10_000);
    meter.frame(100);
    expect(meter.reading().frames).toBe(1);
  });

  it('with irregular frame times, reads frames − 1 over the span of the frames in the window', () => {
    const meter = new FpsMeter();
    const times: number[] = [];
    let t = 0;
    // Irregular gaps between 1 ms and about 250 ms, over about 24 s.
    for (let i = 0; i < 400; i++) {
      t += 1 + ((i * 37) % 11) * ((i % 7) + 1) * 3.3;
      times.push(t);
      meter.frame(t);
    }
    const last = times[times.length - 1];
    const kept = times.filter((x) => x >= last - FPS_WINDOW_MS);
    const span = kept[kept.length - 1] - kept[0];
    const r = meter.reading();
    expect(last).toBeGreaterThan(FPS_WINDOW_MS);
    expect(r.frames).toBe(kept.length);
    expect(r.spanMs).toBeCloseTo(span, 6);
    expect(r.fps).toBeCloseTo(((kept.length - 1) * 1000) / span, 6);
    expect(r.complete).toBe(true);
  });
});

describe('formatFps', () => {
  it('shows one decimal, or a dash without a reading', () => {
    expect(formatFps(59.94)).toBe('59.9 fps');
    expect(formatFps(null)).toBe('– fps');
  });
});

describe('shouldShowPerfOverlay', () => {
  it('is true only in development with perf=1', () => {
    expect(shouldShowPerfOverlay({ DEV: true }, '?perf=1')).toBe(true);
    expect(shouldShowPerfOverlay({ DEV: true }, '?test=1&perf=1')).toBe(true);
    expect(shouldShowPerfOverlay({ DEV: true }, '')).toBe(false);
    expect(shouldShowPerfOverlay({ DEV: true }, '?perf=0')).toBe(false);
    expect(shouldShowPerfOverlay({ DEV: true }, '?perf=true')).toBe(false);
    expect(shouldShowPerfOverlay({ DEV: false }, '?perf=1')).toBe(false);
    expect(shouldShowPerfOverlay({}, '?perf=1')).toBe(false);
    expect(shouldShowPerfOverlay(null, '?perf=1')).toBe(false);
  });
});
