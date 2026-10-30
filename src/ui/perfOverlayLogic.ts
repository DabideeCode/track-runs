/**
 * Pure parts of the development FPS overlay (task 17.2; design section 12,
 * D-60; Requirement 32.1).
 *
 * Requirement 32.1 measures "the average frame rate over a continuous
 * 10-second sample". `FpsMeter` keeps the timestamps of the frames in the last
 * `windowMs` and reports frames per second over that span: (frames − 1)
 * intervals divided by the time from the oldest to the newest frame. Until a
 * full window has been seen the value covers the shorter span and `complete`
 * is false.
 */

export const FPS_WINDOW_MS = 10_000;

export interface FpsReading {
  /** Average frames per second over the sampled span; null with fewer than 2 frames. */
  fps: number | null;
  /** Length of the sampled span in milliseconds (at most the window). */
  spanMs: number;
  /** Number of frames in the span. */
  frames: number;
  /** True once the span covers the whole window. */
  complete: boolean;
}

export class FpsMeter {
  private readonly times: number[] = [];
  private head = 0;
  private firstSeen: number | null = null;

  readonly windowMs: number;

  constructor(windowMs: number = FPS_WINDOW_MS) {
    if (!(windowMs > 0)) throw new RangeError('windowMs must be positive');
    this.windowMs = windowMs;
  }

  /** Records a frame at `now` (milliseconds, e.g. a requestAnimationFrame timestamp). */
  frame(now: number): void {
    if (!Number.isFinite(now)) return;
    const last = this.times.length > this.head ? this.times[this.times.length - 1] : null;
    // A clock that goes backwards (or a new time origin) starts a new sample.
    if (last !== null && now < last) this.reset();
    if (this.firstSeen === null) this.firstSeen = now;
    this.times.push(now);
    // Keep the frame that sits exactly on the window edge, so a 10 s span can be complete.
    const cutoff = now - this.windowMs;
    while (this.head < this.times.length - 1 && this.times[this.head] < cutoff) this.head++;
    // Compact the array now and then, so memory stays bounded.
    if (this.head > 1024 && this.head * 2 > this.times.length) {
      this.times.splice(0, this.head);
      this.head = 0;
    }
  }

  reading(): FpsReading {
    const frames = this.times.length - this.head;
    if (frames < 2) return { fps: null, spanMs: 0, frames, complete: false };
    const first = this.times[this.head];
    const last = this.times[this.times.length - 1];
    const spanMs = last - first;
    const fps = spanMs > 0 ? ((frames - 1) * 1000) / spanMs : null;
    const complete = this.firstSeen !== null && last - this.firstSeen >= this.windowMs;
    return { fps, spanMs, frames, complete };
  }

  reset(): void {
    this.times.length = 0;
    this.head = 0;
    this.firstSeen = null;
  }
}

/** Text shown in the overlay, e.g. "58.9 fps" or "– fps". */
export function formatFps(fps: number | null): string {
  return fps === null ? '– fps' : `${fps.toFixed(1)} fps`;
}

export interface PerfEnv {
  DEV?: boolean;
}

/**
 * True only in a development build with `perf=1` in the query string.
 * Evaluated once at start-up in `main.tsx`.
 */
export function shouldShowPerfOverlay(env: PerfEnv | null | undefined, search: string | null | undefined): boolean {
  if (env?.DEV !== true) return false;
  return new URLSearchParams(search ?? '').get('perf') === '1';
}
