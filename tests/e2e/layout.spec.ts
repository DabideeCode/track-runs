/**
 * Layout, accessibility, network and development-server checks (task 18.5).
 *
 * - The 3D canvas fills the viewport with no scrollbars, and follows it when
 *   the window is resized: within 200 ms, with a drawing buffer of the same
 *   aspect ratio and an undistorted projection (Requirements 2.1, 2.8).
 * - Right-clicking the canvas opens no browser context menu (Requirement 9.10).
 * - At 1920 × 1080 in Build mode, the visible overlay panels cover at most 25%
 *   of the viewport, measured as the union of their boxes (Requirement 30.8).
 * - Every control reached with Tab on the menu, the playfield and the delete
 *   dialog shows a focus ring of at least 2 px that no container clips and
 *   that goes away when focus moves on (Requirement 40.5).
 * - No request goes to another origin, and after the first load the app only
 *   GETs its own static files: no diorama or settings data leaves the page
 *   (Requirements 1.9, 41.8).
 * - `npm run dev` serves the main menu and exposes `window.__DIORAMA__`
 *   without `?test=1`, with no console errors (Requirements 38.2, 40.8, 42.6).
 *   Each worker starts its own Vite dev server on a free port (D-63).
 *
 * Requirements: 1.9, 2.1, 2.8, 9.10, 30.8, 38.2, 40.5, 40.8, 41.8, 42.6
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import type { Page } from '@playwright/test';
import {
  HOOK_METHODS,
  SAVE_KEY,
  byTestId,
  expect,
  getState,
  gotoApp,
  hook,
  makeDiorama,
  makeSaveFile,
  openNewDiorama,
  seedStorage,
  test,
  tileToScreen,
  waitForMenu,
  waitForPlayfield,
} from './helpers';

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

interface CanvasMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  bufferWidth: number;
  bufferHeight: number;
  innerWidth: number;
  innerHeight: number;
  /** Document overflow in CSS px (0 when nothing scrolls). */
  overflowX: number;
  overflowY: number;
  canvasCount: number;
}

function canvasMetrics(page: Page): Promise<CanvasMetrics | null> {
  return page.evaluate(() => {
    const canvases = document.querySelectorAll('[data-testid="playfield"] canvas');
    const canvas = canvases[0] as HTMLCanvasElement | undefined;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const de = document.documentElement;
    const body = document.body;
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      overflowX: Math.max(de.scrollWidth - de.clientWidth, body.scrollWidth - body.clientWidth, window.innerWidth - de.clientWidth),
      overflowY: Math.max(de.scrollHeight - de.clientHeight, body.scrollHeight - body.clientHeight, window.innerHeight - de.clientHeight),
      canvasCount: canvases.length,
    };
  });
}

/** The canvas covers the viewport exactly, nothing scrolls, and the buffer has the canvas's aspect ratio. */
function expectFillsViewport(m: CanvasMetrics | null, label: string): void {
  expect(m, `${label}: a playfield canvas exists`).not.toBeNull();
  const c = m!;
  expect(c.canvasCount, `${label}: one canvas`).toBe(1);
  expect(Math.abs(c.left), `${label}: canvas left edge`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(c.top), `${label}: canvas top edge`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(c.width - c.innerWidth), `${label}: canvas width ${c.width} vs ${c.innerWidth}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(c.height - c.innerHeight), `${label}: canvas height ${c.height} vs ${c.innerHeight}`).toBeLessThanOrEqual(0.5);
  expect(c.overflowX, `${label}: no horizontal scrolling`).toBeLessThanOrEqual(0);
  expect(c.overflowY, `${label}: no vertical scrolling`).toBeLessThanOrEqual(0);
  // The drawing buffer is the CSS size times one pixel ratio (rounded), so
  // the picture is not stretched in either direction.
  const k = c.bufferWidth / c.width;
  expect(k, `${label}: drawing buffer exists`).toBeGreaterThan(0);
  expect(Math.abs(c.bufferHeight - c.height * k), `${label}: buffer ${c.bufferWidth}×${c.bufferHeight} for ${c.width}×${c.height}`).toBeLessThanOrEqual(1.5);
}

/**
 * Resizes the viewport and returns the milliseconds from the window's
 * `resize` event until the canvas and its drawing buffer match the new size
 * (Infinity if that takes more than 3 s).
 */
async function resizeAndTime(page: Page, width: number, height: number): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __e2eResizeAt: number | null; __e2eResizeListener?: boolean };
    w.__e2eResizeAt = null;
    if (!w.__e2eResizeListener) {
      w.__e2eResizeListener = true;
      window.addEventListener('resize', () => {
        w.__e2eResizeAt ??= performance.now();
      });
    }
  });
  await page.setViewportSize({ width, height });
  return page.evaluate(
    ([wantW, wantH]) =>
      new Promise<number>((resolve) => {
        const w = window as unknown as { __e2eResizeAt: number | null };
        const fallbackStart = performance.now();
        const check = () => {
          const start = w.__e2eResizeAt ?? fallbackStart;
          const canvas = document.querySelector('[data-testid="playfield"] canvas') as HTMLCanvasElement | null;
          if (canvas && window.innerWidth === wantW && window.innerHeight === wantH) {
            const r = canvas.getBoundingClientRect();
            const k = canvas.width / r.width;
            const sizeOk = Math.abs(r.width - wantW) <= 0.5 && Math.abs(r.height - wantH) <= 0.5;
            const bufferOk = k > 0 && Math.abs(canvas.height - r.height * k) <= 1.5 && Math.abs(canvas.width - r.width * k) <= 1.5;
            // The buffer must have been resized for this size, not left over
            // from the previous one: its aspect matches the new viewport.
            const aspectOk = Math.abs(canvas.width / canvas.height - wantW / wantH) <= 0.01;
            if (sizeOk && bufferOk && aspectOk) {
              resolve(performance.now() - start);
              return;
            }
          }
          if (performance.now() - start > 3000) resolve(Number.POSITIVE_INFINITY);
          else requestAnimationFrame(check);
        };
        check();
      }),
    [width, height] as const,
  );
}

/**
 * Screen spans of five tiles across and down the middle of the grid, divided
 * by the viewport height. With a perspective camera whose pose is unchanged,
 * both stay the same at any viewport size when the camera aspect follows the
 * canvas; a stale aspect stretches the horizontal one.
 */
async function projectedSpans(page: Page): Promise<{ across: number; down: number }> {
  const height = page.viewportSize()!.height;
  const west = await tileToScreen(page, 5, 7);
  const east = await tileToScreen(page, 10, 7);
  const north = await tileToScreen(page, 7, 5);
  const south = await tileToScreen(page, 7, 10);
  return {
    across: Math.hypot(east.x - west.x, east.y - west.y) / height,
    down: Math.hypot(south.x - north.x, south.y - north.y) / height,
  };
}

test.describe('3D canvas', () => {
  test('fills the viewport and follows it when the window is resized', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoApp(page);
    await openNewDiorama(page);
    await expect.poll(async () => (await canvasMetrics(page))?.bufferWidth ?? 0).toBeGreaterThan(0);
    expectFillsViewport(await canvasMetrics(page), '1280×720');
    const reference = await projectedSpans(page);

    const sizes: Array<[number, number]> = [
      [1024, 768],
      [1920, 1080],
      [1440, 560],
      [800, 600],
      [1280, 720],
    ];
    for (const [width, height] of sizes) {
      const label = `${width}×${height}`;
      const elapsed = await resizeAndTime(page, width, height);
      expect(elapsed, `${label}: canvas resized within 200 ms (took ${elapsed.toFixed(0)} ms)`).toBeLessThanOrEqual(200);
      expectFillsViewport(await canvasMetrics(page), label);
      const spans = await projectedSpans(page);
      expect(Math.abs(spans.across / reference.across - 1), `${label}: horizontal scale ${spans.across} vs ${reference.across}`).toBeLessThanOrEqual(0.02);
      expect(Math.abs(spans.down / reference.down - 1), `${label}: vertical scale ${spans.down} vs ${reference.down}`).toBeLessThanOrEqual(0.02);
    }
  });

  test('right-clicking the canvas opens no context menu', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    await page.evaluate(() => {
      const w = window as unknown as { __e2eContextMenus: boolean[] };
      w.__e2eContextMenus = [];
      // Bubble listener on window: runs after React's handler on the root.
      window.addEventListener('contextmenu', (e) => w.__e2eContextMenus.push(e.defaultPrevented));
    });
    const centre = await tileToScreen(page, 8, 8);
    await page.mouse.click(centre.x, centre.y, { button: 'right' });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __e2eContextMenus: boolean[] }).__e2eContextMenus))
      .toEqual([true]);
  });
});

// ---------------------------------------------------------------------------
// Overlay coverage
// ---------------------------------------------------------------------------

interface CoverageResult {
  ratio: number;
  panels: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  /** Visible playfield controls that are not inside any counted panel. */
  outside: string[];
}

function overlayCoverage(page: Page, controlIds: readonly string[]): Promise<CoverageResult> {
  return page.evaluate((ids) => {
    const root = document.querySelector('[data-overlay-root]');
    if (!root) throw new Error('overlay root not found');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isVisible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || Number(s.opacity) === 0) return false;
      }
      return getComputedStyle(el).visibility !== 'hidden';
    };
    const panels = [...root.querySelectorAll('.panel')].filter(isVisible);
    const rects = panels
      .map((p) => p.getBoundingClientRect())
      .map((r) => ({
        x0: Math.max(0, r.left),
        y0: Math.max(0, r.top),
        x1: Math.min(vw, r.right),
        y1: Math.min(vh, r.bottom),
      }))
      .filter((r) => r.x1 > r.x0 && r.y1 > r.y0);
    // Area of the union of the rectangles (coordinate compression).
    const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
    const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        const cy = (ys[j] + ys[j + 1]) / 2;
        if (rects.some((r) => cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1)) {
          area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
        }
      }
    }
    const outside = ids.filter((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      return el !== null && isVisible(el) && !panels.some((p) => p.contains(el));
    });
    return {
      ratio: area / (vw * vh),
      panels: panels.map((p) => {
        const r = p.getBoundingClientRect();
        const name = p.getAttribute('aria-label') ?? p.tagName.toLowerCase();
        return { name, x: r.left, y: r.top, width: r.width, height: r.height };
      }),
      outside,
    };
  }, controlIds);
}

test.describe('overlay coverage at 1920 × 1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the visible panels cover at most 25% of the viewport in Build mode', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');
    await expect(page.locator('aside[aria-label="Palette"]')).toHaveAttribute('data-state', 'visible');
    // Move the pointer off every control, so no tooltip or hover state shows.
    await page.mouse.move(960, 540);

    // Default state, then with a selected piece (the action bar enables
    // Delete) and in the other setting.
    const controls = [
      'mode-toggle', 'drive-toggle', 'setting-select', 'flip-direction', 'save-button', 'back-to-menu',
      'delete-piece', 'reset-view', 'mute-toggle', 'music-volume', 'sfx-volume',
      ...['straight', 'curve', 'tunnel', 'station', 'buffer', 'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks'].map((t) => `palette-${t}`),
    ];
    const checks: Array<[string, () => Promise<void>]> = [
      ['default', async () => {}],
      [
        'piece selected, kitchen',
        async () => {
          const placed = await hook(page, 'placePiece', 'straight', 7, 7);
          expect(placed.ok).toBe(true);
          await byTestId(page, 'setting-select').getByText('Kitchen table').click();
          await expect(byTestId(page, 'setting-select')).toHaveAttribute('data-value', 'kitchen');
          await page.mouse.move(960, 540);
        },
      ],
    ];
    for (const [label, prepare] of checks) {
      await prepare();
      const result = await overlayCoverage(page, controls);
      const detail = `${label}: ${(result.ratio * 100).toFixed(1)}% from ${JSON.stringify(result.panels)}`;
      expect(result.panels.length, `${detail}: top bar, palette, action bar and view panel are measured`).toBeGreaterThanOrEqual(4);
      expect(result.outside, `${label}: every visible control lies in a measured panel`).toEqual([]);
      expect(result.ratio, detail).toBeLessThanOrEqual(0.25);
    }
  });
});

// ---------------------------------------------------------------------------
// Keyboard focus ring
// ---------------------------------------------------------------------------

interface FocusInfo {
  /** `data-testid`, else accessible-ish label, of the focused element. */
  name: string;
  /** False when focus is on `body` or outside the document. */
  isControl: boolean;
  /** Visible ring thickness in CSS px (box-shadow ring minus its offset, or the outline width). */
  ringWidth: number;
  /** Ancestor or viewport that clips the ring, if any. */
  clippedBy: string | null;
  /** Ring thickness now left on the previously focused element. */
  previousRingWidth: number;
  previousName: string | null;
}

/** Reads the focus ring of `document.activeElement` and of the element focused before it. */
function readFocus(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const w = window as unknown as { __e2ePrevFocus?: Element | null };

    /** Splits a computed `box-shadow` into its layers. */
    const shadows = (value: string) => {
      if (!value || value === 'none') return [];
      const layers: string[] = [];
      let depth = 0;
      let current = '';
      for (const ch of value) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
          layers.push(current);
          current = '';
        } else current += ch;
      }
      layers.push(current);
      return layers.map((layer) => {
        const colour = layer.match(/[a-z-]+\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/i)?.[0] ?? '';
        const rest = layer.replace(colour, ' ');
        const lengths = (rest.match(/-?[\d.]+(?:px)?(?=\s|$)/g) ?? []).map((n) => parseFloat(n));
        let alpha = 1;
        if (/^transparent$/i.test(colour)) alpha = 0;
        else if (colour.includes('/')) alpha = parseFloat(colour.split('/')[1]);
        else {
          const args = colour.slice(colour.indexOf('(') + 1, -1).split(',');
          if (/^rgba?\(/i.test(colour) && args.length === 4) alpha = parseFloat(args[3]);
        }
        if (Number.isNaN(alpha)) alpha = 1;
        const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
        return { inset: /\binset\b/.test(layer), x, y, blur, spread, alpha };
      });
    };

    /** Visible ring thickness and how far it reaches outside the border box. */
    const ring = (el: Element) => {
      const s = getComputedStyle(el);
      const flat = shadows(s.boxShadow)
        .filter((l) => !l.inset && l.x === 0 && l.y === 0 && l.blur === 0 && l.spread > 0)
        .sort((a, b) => b.spread - a.spread);
      let shadowWidth = 0;
      let shadowExtent = 0;
      const outerIndex = flat.findIndex((l) => l.alpha > 0);
      if (outerIndex >= 0) {
        const outer = flat[outerIndex];
        const inner = flat.slice(outerIndex + 1).find((l) => l.spread < outer.spread);
        shadowWidth = outer.spread - (inner?.spread ?? 0);
        shadowExtent = outer.spread;
      }
      const outlineWidth = s.outlineStyle !== 'none' ? parseFloat(s.outlineWidth) || 0 : 0;
      const outlineExtent = outlineWidth > 0 ? outlineWidth + (parseFloat(s.outlineOffset) || 0) : 0;
      return { width: Math.max(shadowWidth, outlineWidth), extent: Math.max(shadowExtent, outlineExtent) };
    };

    const describe = (el: Element) =>
      el.getAttribute('data-testid') ??
      el.getAttribute('aria-label') ??
      `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;

    const active = document.activeElement;
    const isControl = active !== null && active !== document.body && active !== document.documentElement;
    let ringWidth = 0;
    let clippedBy: string | null = null;
    if (isControl) {
      const r = ring(active);
      ringWidth = r.width;
      const b = active.getBoundingClientRect();
      const outer = { left: b.left - r.extent, top: b.top - r.extent, right: b.right + r.extent, bottom: b.bottom + r.extent };
      const tol = 0.5;
      const inside = (c: { left: number; top: number; right: number; bottom: number }) =>
        outer.left >= c.left - tol && outer.top >= c.top - tol && outer.right <= c.right + tol && outer.bottom <= c.bottom + tol;
      if (!inside({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight })) clippedBy = 'viewport';
      for (let e = active.parentElement; e && !clippedBy; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const rect = e.getBoundingClientRect();
        const left = rect.left + e.clientLeft;
        const top = rect.top + e.clientTop;
        const clip = { left, top, right: left + e.clientWidth, bottom: top + e.clientHeight };
        if (!inside(clip)) clippedBy = `${describe(e)} (overflow ${s.overflowX}/${s.overflowY})`;
      }
    }
    const previous = w.__e2ePrevFocus ?? null;
    const previousRingWidth = previous && previous !== active && previous.isConnected ? ring(previous).width : 0;
    const previousName = previous && previous !== active ? describe(previous) : null;
    w.__e2ePrevFocus = isControl ? active : null;
    return { name: isControl ? describe(active) : 'body', isControl, ringWidth, clippedBy, previousRingWidth, previousName };
  });
}

/**
 * Presses Tab up to `max` times and checks the ring on each control reached.
 * Stops when focus returns to the first control or leaves the page. Returns
 * the names of the controls reached.
 */
async function tabThrough(page: Page, max: number, tabKey: string, screen: string): Promise<string[]> {
  await page.evaluate(() => {
    (window as unknown as { __e2ePrevFocus?: Element | null }).__e2ePrevFocus = null;
  });
  const reached: string[] = [];
  let first: string | null = null;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(tabKey);
    const info = await readFocus(page);
    if (info.previousName !== null) {
      expect(info.previousRingWidth, `${screen}: ring removed from ${info.previousName} after focus left`).toBe(0);
    }
    if (!info.isControl) {
      if (reached.length > 0) break;
      continue;
    }
    if (info.name === first) break;
    first ??= info.name;
    reached.push(info.name);
    expect(info.ringWidth, `${screen}: focus ring on ${info.name}`).toBeGreaterThanOrEqual(2);
    expect(info.clippedBy, `${screen}: focus ring on ${info.name} is not clipped`).toBeNull();
  }
  return reached;
}

test.describe('keyboard focus ring', () => {
  // Safari and WebKit move Tab focus to buttons only with Option (Alt) held.
  const tabKeyFor = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab');

  test('every control reached with Tab shows a ring of at least 2 px on the menu, the playfield and the delete dialog', async ({
    page,
    browserName,
  }) => {
    const tabKey = tabKeyFor(browserName);
    const saved = makeDiorama({ name: 'Focus ring diorama' });
    await seedStorage(page, { [SAVE_KEY]: makeSaveFile([saved]) });
    await gotoApp(page);

    const menu = await tabThrough(page, 20, tabKey, 'main menu');
    for (const id of ['new-diorama', 'diorama-open', 'diorama-rename', 'diorama-delete']) {
      expect(menu, 'main menu controls reached with Tab').toContain(id);
    }

    // Delete dialog: focus is trapped inside it.
    await byTestId(page, 'diorama-delete').click();
    await expect(byTestId(page, 'confirm-ok')).toBeVisible();
    const dialog = await tabThrough(page, 6, tabKey, 'delete dialog');
    expect(dialog, 'delete dialog controls reached with Tab').toContain('confirm-ok');
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'confirm-ok')).toHaveCount(0);

    await byTestId(page, 'diorama-open').click();
    await waitForPlayfield(page);
    await page.mouse.move(1, 1);
    // Start from the document, as after a page load.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const playfield = await tabThrough(page, 60, tabKey, 'playfield');
    for (const id of [
      'back-to-menu', 'save-button', 'mode-toggle', 'flip-direction', 'palette-straight', 'palette-blocks',
      'reset-view', 'mute-toggle',
    ]) {
      expect(playfield, 'playfield controls reached with Tab').toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

interface RecordedRequest {
  url: string;
  method: string;
  hasBody: boolean;
  afterFirstLoad: boolean;
}

test.describe('network', () => {
  test('no request leaves the app origin, and no diorama or settings data is sent', async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL!).origin;
    const requests: RecordedRequest[] = [];
    const sockets: string[] = [];
    let firstLoadDone = false;
    page.on('request', (r) => {
      requests.push({ url: r.url(), method: r.method(), hasBody: (r.postDataBuffer()?.length ?? 0) > 0, afterFirstLoad: firstLoadDone });
    });
    page.on('websocket', (ws) => sockets.push(ws.url()));

    await gotoApp(page);
    await page.waitForLoadState('load');
    firstLoadDone = true;

    // Build, change settings, save, reload and reopen: every storage path.
    await openNewDiorama(page);
    expect((await hook(page, 'placePiece', 'straight', 3, 4)).ok).toBe(true);
    expect((await hook(page, 'placePiece', 'house', 10, 10)).ok).toBe(true);
    await byTestId(page, 'setting-select').getByText('Kitchen table').click();
    await byTestId(page, 'mute-toggle').click();
    await byTestId(page, 'mute-toggle').click();
    await byTestId(page, 'save-button').click();
    await expect.poll(async () => (await getState(page)).isDirty).toBe(false);
    const { dioramaId } = await getState(page);
    expect(dioramaId).not.toBeNull();
    await byTestId(page, 'back-to-menu').click();
    await waitForMenu(page);
    await page.reload();
    await waitForMenu(page);
    await byTestId(page, 'diorama-open').first().click();
    await waitForPlayfield(page);
    await expect.poll(async () => (await getState(page)).pieces.length).toBe(2);
    // Let lazy chunks and assets finish: wait until 1 s passes with no new request.
    let seen = -1;
    await expect
      .poll(
        () => {
          const settled = requests.length === seen;
          seen = requests.length;
          return settled;
        },
        { intervals: [1000], timeout: 15_000, message: 'requests settle' },
      )
      .toBe(true);

    const offOrigin = requests.filter((r) => {
      if (r.url.startsWith('data:') || r.url.startsWith('blob:')) return false;
      return new URL(r.url).origin !== appOrigin;
    });
    expect(offOrigin.map((r) => r.url), `every request goes to ${appOrigin}`).toEqual([]);
    expect(sockets, 'no WebSocket connections in the production build').toEqual([]);

    const later = requests.filter((r) => r.afterFirstLoad);
    expect(later.length, 'the playfield chunk and assets load after the first load').toBeGreaterThan(0);
    const sending = later.filter((r) => r.method !== 'GET' || r.hasBody);
    expect(sending.map((r) => `${r.method} ${r.url}`), 'after the first load only GETs without a body are made').toEqual([]);
    const name = 'Untitled diorama';
    const leaking = requests.filter((r) => r.url.includes(dioramaId!) || decodeURIComponent(r.url).includes(name));
    expect(leaking.map((r) => r.url), 'no request URL carries diorama data').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Development server (D-63)
// ---------------------------------------------------------------------------

/** A free TCP port on 127.0.0.1 (the OS picks one). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

interface DevServer {
  url: string;
  output: () => string;
  stop: () => Promise<void>;
}

/**
 * Starts the command behind `npm run dev` (`vite`, checked against
 * package.json) on its own port and waits until it serves the page. Vite is
 * run through Node directly, so stopping it kills the server process itself
 * (no shell or npm wrapper left behind on Windows).
 */
async function startDevServer(projectRoot: string, port: number): Promise<DevServer> {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  expect(pkg.scripts?.dev, 'npm run dev runs vite').toBe('vite');
  const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const host = '127.0.0.1';
  const child: ChildProcess = spawn(
    process.execPath,
    [viteBin, '--host', host, '--port', String(port), '--strictPort', '--clearScreen', 'false'],
    { cwd: projectRoot, env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let log = '';
  child.stdout?.on('data', (d: Buffer) => (log += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (log += d.toString()));
  let exited = false;
  const exitPromise = new Promise<void>((resolve) => child.once('exit', () => ((exited = true), resolve())));
  const stop = async () => {
    if (!exited) {
      child.kill();
      await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 5000))]);
      if (!exited) child.kill('SIGKILL');
    }
  };
  const url = `http://${host}:${port}/`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (exited) throw new Error(`The dev server exited before it was ready:\n${log}`);
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`The dev server did not answer at ${url} within 90 s:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { url, output: () => log, stop };
}

test.describe('development server', () => {
  let server: DevServer | null = null;

  // eslint-disable-next-line no-empty-pattern
  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const projectRoot = path.dirname(testInfo.config.configFile ?? path.join(process.cwd(), 'playwright.config.ts'));
    // E2E_DEV_PORT pins the port (plus the worker's parallel index, so the
    // browsers of one run do not collide); by default the OS picks a free one.
    const base = Number.parseInt(process.env.E2E_DEV_PORT ?? '', 10);
    const port = Number.isFinite(base) && base > 0 ? base + testInfo.parallelIndex : await freePort();
    server = await startDevServer(projectRoot, port);
  });

  test.afterAll(async () => {
    await server?.stop();
    server = null;
  });

  test('npm run dev serves the main menu and exposes the hook without ?test=1', async ({ page }) => {
    test.setTimeout(90_000);
    const dev = server!;
    await page.goto(dev.url);
    expect(new URL(page.url()).searchParams.has('test'), 'no test parameter in the URL').toBe(false);
    await expect(byTestId(page, 'main-menu'), `main menu from the dev server\n${dev.output()}`).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveTitle('Track');
    await page.waitForFunction(() => typeof window.__DIORAMA__ === 'object' && window.__DIORAMA__ !== null, undefined, {
      timeout: 30_000,
    });
    const functions = await page.evaluate(() =>
      Object.keys(window.__DIORAMA__ ?? {})
        .filter((k) => typeof (window.__DIORAMA__ as unknown as Record<string, unknown>)[k] === 'function')
        .sort(),
    );
    expect(functions).toEqual([...HOOK_METHODS].sort());
  });
});
