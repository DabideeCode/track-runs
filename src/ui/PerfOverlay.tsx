/**
 * Development-only FPS overlay (task 17.2; design section 12, D-60;
 * Requirements 32.1, 32.2).
 *
 * Shown only when `main.tsx` finds a development build and `?perf=1`; it is
 * loaded there with a dynamic `import()` inside an `import.meta.env.DEV`
 * branch, so a production build contains none of it. It counts
 * requestAnimationFrame callbacks (one per displayed frame, the same clock the
 * R3F canvas renders on) and shows the average over the last 10 seconds,
 * refreshed twice a second. The panel sits in the top-left corner, is
 * `pointer-events: none` and carries no test id, so it changes nothing the
 * app or its tests interact with.
 */
import { useEffect, useState } from 'react';
import { FPS_WINDOW_MS, FpsMeter, formatFps, type FpsReading } from '@/ui/perfOverlayLogic';

/** How often the text is refreshed, in milliseconds. */
export const PERF_REFRESH_MS = 500;

export interface PerfOverlayProps {
  /** Defaults to `window.requestAnimationFrame`. */
  requestFrame?: (cb: (now: number) => void) => number;
  /** Defaults to `window.cancelAnimationFrame`. */
  cancelFrame?: (handle: number) => void;
  windowMs?: number;
}

const EMPTY: FpsReading = { fps: null, spanMs: 0, frames: 0, complete: false };

export function PerfOverlay({ requestFrame, cancelFrame, windowMs = FPS_WINDOW_MS }: PerfOverlayProps) {
  const [reading, setReading] = useState<FpsReading>(EMPTY);

  useEffect(() => {
    const request = requestFrame ?? ((cb: (now: number) => void) => window.requestAnimationFrame(cb));
    const cancel = cancelFrame ?? ((h: number) => window.cancelAnimationFrame(h));
    const meter = new FpsMeter(windowMs);
    let lastShown = -Infinity;
    let handle = 0;
    const onFrame = (now: number) => {
      meter.frame(now);
      if (now - lastShown >= PERF_REFRESH_MS || now < lastShown) {
        lastShown = now;
        setReading(meter.reading());
      }
      handle = request(onFrame);
    };
    handle = request(onFrame);
    return () => cancel(handle);
  }, [requestFrame, cancelFrame, windowMs]);

  const seconds = Math.min(windowMs, reading.spanMs) / 1000;
  return (
    <div
      data-perf-overlay=""
      className="pointer-events-none fixed top-3 left-3 z-50 rounded-md bg-panel/90 px-2 py-1 text-xs text-panel-foreground tabular-nums shadow-panel select-none"
    >
      <div className="font-semibold">{formatFps(reading.fps)}</div>
      <div className="text-muted-foreground">
        {reading.complete ? `${windowMs / 1000} s average` : `${seconds.toFixed(1)} s of ${windowMs / 1000} s`}
      </div>
    </div>
  );
}

export default PerfOverlay;
