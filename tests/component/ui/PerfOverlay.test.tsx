// @vitest-environment jsdom
/**
 * Development FPS overlay (task 17.2, D-60; Requirement 32.1).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { PerfOverlay } from '@/ui/PerfOverlay';

afterEach(cleanup);

/** A manual requestAnimationFrame: `step(t)` runs the pending callback at time t. */
function manualFrames() {
  let pending: ((now: number) => void) | null = null;
  let cancelled = 0;
  return {
    requestFrame: (cb: (now: number) => void) => {
      pending = cb;
      return 1;
    },
    cancelFrame: () => {
      pending = null;
      cancelled++;
    },
    step(now: number) {
      const cb = pending;
      pending = null;
      cb?.(now);
    },
    get cancelled() {
      return cancelled;
    },
  };
}

describe('PerfOverlay', () => {
  it('shows the rolling average of the frames it sees, in a corner panel that takes no pointer events', () => {
    const frames = manualFrames();
    const { container } = render(<PerfOverlay requestFrame={frames.requestFrame} cancelFrame={frames.cancelFrame} />);
    const panel = container.querySelector('[data-perf-overlay]') as HTMLElement;
    expect(panel).toHaveClass('pointer-events-none', 'fixed');
    expect(panel.querySelector('[data-testid]')).toBeNull();
    expect(panel).toHaveTextContent('– fps');

    // 12 s at 50 fps (20 ms per frame).
    act(() => {
      for (let i = 0; i <= 600; i++) frames.step(i * 20);
    });
    expect(panel).toHaveTextContent('50.0 fps');
    expect(panel).toHaveTextContent('10 s average');
  });

  it('shows how much of the 10 s window it has so far, and stops its frame loop on unmount', () => {
    const frames = manualFrames();
    const { container, unmount } = render(
      <PerfOverlay requestFrame={frames.requestFrame} cancelFrame={frames.cancelFrame} />,
    );
    act(() => {
      for (let i = 0; i <= 100; i++) frames.step(i * 25); // 2.5 s at 40 fps
    });
    const panel = container.querySelector('[data-perf-overlay]') as HTMLElement;
    expect(panel).toHaveTextContent('40.0 fps');
    expect(panel).toHaveTextContent('2.5 s of 10 s');
    unmount();
    expect(frames.cancelled).toBeGreaterThan(0);
  });
});

describe('perf overlay loading (not rendered without the flag)', () => {
  const root = join(process.cwd(), 'src');

  it('no source file imports the overlay component statically', () => {
    const files = readdirSyncTs(root).filter((f) => !f.endsWith(join('ui', 'PerfOverlay.tsx')));
    const staticImport = /(?:^|\n)\s*(?:import|export)\s(?!type\s)[^;]*?from\s+['"][^'"]*\/PerfOverlay['"]/;
    for (const f of files) expect(staticImport.test(readFileSync(f, 'utf8')), f).toBe(false);
  });

  it('main.tsx loads it only inside the development branch, behind shouldShowPerfOverlay', () => {
    const main = readFileSync(join(root, 'main.tsx'), 'utf8');
    expect(main).toMatch(
      /import\.meta\.env\.DEV\s*&&\s*shouldShowPerfOverlay\(import\.meta\.env,\s*window\.location\.search\)\s*\?\s*lazy\(\(\)\s*=>\s*import\('@\/ui\/PerfOverlay'\)\)\s*:\s*null/,
    );
    expect(main.match(/import\('@\/ui\/PerfOverlay'\)/g)).toHaveLength(1);
  });
});

function readdirSyncTs(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => join(dir, f));
}
