/**
 * Shared helpers for the Playwright end-to-end tests (tasks 18.1 to 18.5).
 *
 * Usage in a spec:
 *
 *   import { test, expect, gotoApp, openNewDiorama, hook } from './helpers';
 *
 *   test('places a straight', async ({ page }) => {
 *     await gotoApp(page);                       // `/?test=1`, waits for the menu and the hook
 *     await openNewDiorama(page);                // clicks New diorama, waits for the playfield
 *     const r = await hook(page, 'placePiece', 'straight', 3, 4);
 *     expect(r.ok).toBe(true);
 *   });
 *
 * What is here:
 * - `test`, `expect`: re-exported from `./fixtures`. The `page` fixture fails
 *   the test on any `console.error` or uncaught page error (Requirement 40.4),
 *   so always import `test` from here (or `./fixtures`), never from
 *   '@playwright/test' directly.
 * - `TEST_IDS`, `MENU_TEST_IDS`, `PLAYFIELD_TEST_IDS`, `PALETTE_TYPES`,
 *   `HOOK_METHODS`: the Section 10.1 and 10.2 contract of requirement.md.
 * - `byTestId(page, id)`: `page.locator('[data-testid="<id>"]')`, which also
 *   matches hidden elements (unlike `getByTestId` with visibility checks).
 * - Navigation: `gotoApp(page, { test, query, waitForHook })`,
 *   `openNewDiorama(page)`, `waitForPlayfield(page)`, `waitForMenu(page)`.
 *   The playfield is lazy-loaded (D-59), so always wait for
 *   `[data-testid="playfield"]` after opening one.
 * - Hook access: `waitForHook(page)`, `hook(page, method, ...args)` (typed
 *   against `DioramaTestHook`), `getState(page)`, `getSoundLog(page)`.
 * - Storage: `seedStorage(page, values, { once })` writes localStorage keys
 *   before the app script runs (`page.addInitScript`); with `once: true`
 *   (default) it seeds only the first load in the tab, so a reload keeps what
 *   the app saved. `readStorage(page, key)`, `makeDiorama(partial)`,
 *   `makeSaveFile(dioramas)`, and the key constants `SAVE_KEY`, `AUDIO_KEY`,
 *   `SETTINGS_KEY`, `CORRUPT_BACKUP_PREFIX`.
 * - Board pointer helpers (Build mode, through `window.__DIORAMA_DEBUG__`):
 *   `tileToScreen(page, x, z)` waits until the scene can project the tile and
 *   returns client coordinates; `clickTile`, `hoverTile`, `dragPaletteToTile`,
 *   `dragTileToTile`. Projections are taken after the camera has settled;
 *   do not orbit the camera between `tileToScreen` and the pointer action.
 *
 * Parallel runs: see the header of `playwright.config.ts` for `E2E_PORT` and
 * `E2E_OUT_DIR` (D-62).
 */
import type { Locator, Page } from '@playwright/test';
import type { Diorama, GameState, PieceType, SaveFile } from '@/domain/types';
import type { DioramaTestHook } from '@/testHook/installTestHook';
import { expect, test } from './fixtures';

export { expect, test };

// ---------------------------------------------------------------------------
// The contract (Section 10 of requirement.md)
// ---------------------------------------------------------------------------

export const PALETTE_TYPES: readonly PieceType[] = [
  'straight', 'curve', 'tunnel', 'station', 'buffer',
  'house', 'pineTree', 'roundTree', 'hill', 'car', 'cassette', 'blocks',
];

/** Test ids that are always on the main menu, one each. */
export const MENU_TEST_IDS = ['main-menu', 'new-diorama', 'diorama-list'] as const;

/** Per-entry test ids; one `diorama-item` per entry, one of each control inside it. */
export const ENTRY_TEST_IDS = ['diorama-open', 'diorama-rename', 'diorama-delete'] as const;

/** Test ids that are always on the playfield, one each. */
export const PLAYFIELD_TEST_IDS = [
  'playfield',
  ...PALETTE_TYPES.map((t) => `palette-${t}`),
  'mode-toggle', 'drive-toggle', 'setting-select', 'flip-direction',
  'save-button', 'back-to-menu', 'delete-piece', 'reset-view',
  'mute-toggle', 'music-volume', 'sfx-volume',
] as const;

/** Every Section 10.1 test id. */
export const TEST_IDS = [
  ...MENU_TEST_IDS, 'diorama-item', ...ENTRY_TEST_IDS, 'rename-input',
  'confirm-ok', 'confirm-discard', ...PLAYFIELD_TEST_IDS, 'toast',
] as const;

/** The 10 methods of `DioramaTestHook` (Section 10.2). */
export const HOOK_METHODS = [
  'getState', 'placePiece', 'movePiece', 'rotatePiece', 'removePiece',
  'getConnections', 'setMode', 'setDriveMode', 'getTrain', 'getSoundLog',
] as const satisfies readonly (keyof DioramaTestHook)[];

export const SAVE_KEY = 'wooden-diorama:v1';
export const CORRUPT_BACKUP_PREFIX = 'wooden-diorama:v1:corrupt-';
export const AUDIO_KEY = 'wooden-diorama:audio';
export const SETTINGS_KEY = 'wooden-diorama:settings';

/** Locator for a test id; matches hidden elements too. */
export function byTestId(page: Page, id: string): Locator {
  return page.locator(`[data-testid="${id}"]`);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface GotoOptions {
  /** Add `test=1` to the query (default true). */
  test?: boolean;
  /** Extra query parameters, e.g. `{ perf: '1' }`. */
  query?: Record<string, string>;
  /** Wait for `window.__DIORAMA__` (default: same as `test`). */
  waitForHook?: boolean;
}

/** Opens the app at `/` and waits for the main menu (the first screen). */
export async function gotoApp(page: Page, opts: GotoOptions = {}): Promise<void> {
  const useHook = opts.test ?? true;
  const params = new URLSearchParams(opts.query);
  if (useHook) params.set('test', '1');
  const qs = params.toString();
  await page.goto(qs ? `/?${qs}` : '/');
  await waitForMenu(page);
  if (opts.waitForHook ?? useHook) await waitForHook(page);
}

export async function waitForMenu(page: Page): Promise<void> {
  await expect(byTestId(page, 'main-menu')).toBeVisible();
}

export async function waitForPlayfield(page: Page): Promise<void> {
  await expect(byTestId(page, 'playfield')).toBeVisible({ timeout: 15_000 });
}

/** Clicks New diorama on the menu and waits for the (lazy) playfield. */
export async function openNewDiorama(page: Page): Promise<void> {
  await byTestId(page, 'new-diorama').click();
  await waitForPlayfield(page);
}

// ---------------------------------------------------------------------------
// Test hook
// ---------------------------------------------------------------------------

export async function waitForHook(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__DIORAMA__ === 'object' && window.__DIORAMA__ !== null);
}

type HookMethod = keyof DioramaTestHook;

/** Calls one hook method in the page and returns its (serialisable) result. */
export async function hook<M extends HookMethod>(
  page: Page,
  method: M,
  ...args: Parameters<DioramaTestHook[M]>
): Promise<ReturnType<DioramaTestHook[M]>> {
  return page.evaluate(
    ([m, a]) => {
      const h = window.__DIORAMA__;
      if (!h) throw new Error('window.__DIORAMA__ is not defined');
      return (h[m] as (...x: unknown[]) => unknown)(...a);
    },
    [method, args] as [M, unknown[]],
  ) as Promise<ReturnType<DioramaTestHook[M]>>;
}

export function getState(page: Page): Promise<GameState> {
  return hook(page, 'getState');
}

export function getSoundLog(page: Page): Promise<string[]> {
  return hook(page, 'getSoundLog');
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let seedCounter = 0;

/**
 * Writes localStorage values before any page script runs. With `once` (the
 * default) only the first document load in this tab is seeded; reloads keep
 * whatever the app wrote. A value of `null` removes the key.
 */
export async function seedStorage(
  page: Page,
  values: Record<string, string | null>,
  opts: { once?: boolean } = {},
): Promise<void> {
  const flag = `__e2e_seeded_${seedCounter++}`;
  await page.addInitScript(
    ({ entries, once, flagKey }) => {
      if (once && sessionStorage.getItem(flagKey) === '1') return;
      for (const [k, v] of entries) {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }
      if (once) sessionStorage.setItem(flagKey, '1');
    },
    { entries: Object.entries(values), once: opts.once ?? true, flagKey: flag },
  );
}

export function readStorage(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

/** All localStorage keys in the page. */
export function storageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage));
}

let dioramaCounter = 0;

/** A valid Diorama (Section 9) with sensible defaults. */
export function makeDiorama(partial: Partial<Diorama> = {}): Diorama {
  const n = ++dioramaCounter;
  const time = new Date(Date.UTC(2026, 9, 1, 12, n)).toISOString();
  return {
    id: `e2e-diorama-${n}`,
    name: `Diorama ${n}`,
    setting: 'bedroom',
    startFacing: 0,
    pieces: [],
    createdAt: time,
    updatedAt: time,
    ...partial,
  };
}

export function makeSaveFile(dioramas: Diorama[]): string {
  const file: SaveFile = { version: 1, dioramas };
  return JSON.stringify(file);
}

// ---------------------------------------------------------------------------
// Board pointer helpers (window.__DIORAMA_DEBUG__)
// ---------------------------------------------------------------------------

/**
 * Client coordinates of a tile centre. Polls until the scene is ready and two
 * successive projections agree (the camera has settled), then returns them.
 */
export async function tileToScreen(page: Page, gridX: number, gridZ: number): Promise<{ x: number; y: number }> {
  let last: { x: number; y: number } | null = null;
  let result: { x: number; y: number } | null = null;
  await expect
    .poll(
      async () => {
        const p = await page.evaluate(
          ([x, z]) => window.__DIORAMA_DEBUG__?.tileToScreen(x, z) ?? null,
          [gridX, gridZ] as const,
        );
        const stable = p !== null && last !== null && Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5;
        last = p;
        if (stable) result = p;
        return stable;
      },
      { message: `tile (${gridX}, ${gridZ}) never got a stable screen position`, timeout: 10_000 },
    )
    .toBe(true);
  return result!;
}

export async function hoverTile(page: Page, gridX: number, gridZ: number): Promise<void> {
  const p = await tileToScreen(page, gridX, gridZ);
  await page.mouse.move(p.x, p.y);
}

export async function clickTile(page: Page, gridX: number, gridZ: number): Promise<void> {
  const p = await tileToScreen(page, gridX, gridZ);
  await page.mouse.click(p.x, p.y);
}

/** Presses a palette item, moves in steps to the tile and releases there. */
export async function dragPaletteToTile(page: Page, type: PieceType, gridX: number, gridZ: number): Promise<void> {
  const target = await tileToScreen(page, gridX, gridZ);
  const box = await byTestId(page, `palette-${type}`).boundingBox();
  if (!box) throw new Error(`palette-${type} is not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

/** Presses on one tile, moves in steps to another and releases there. */
export async function dragTileToTile(
  page: Page,
  from: { gridX: number; gridZ: number },
  to: { gridX: number; gridZ: number },
): Promise<void> {
  const a = await tileToScreen(page, from.gridX, from.gridZ);
  const b = await tileToScreen(page, to.gridX, to.gridZ);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}
