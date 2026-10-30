/**
 * The test contract (Section 10 of requirement.md; task 18.1).
 *
 * - The hook is defined with its 10 methods before the main menu first shows,
 *   and stays (the same object) while moving between menu and playfield.
 * - In the production build without `?test=1`, `window.__DIORAMA__` is never
 *   defined, on any screen.
 * - Every Section 10.1 test id is present on its screen, and the single-use
 *   ids appear at most once.
 * - The tab title is "Track" on both screens.
 *
 * Requirements: 3.1, 3.8, 37.1, 37.7, 37.9, 37.10, 37.11, 37.13, 38.1, 38.3, 38.4, 38.5
 */
import type { Page } from '@playwright/test';
import {
  ENTRY_TEST_IDS,
  HOOK_METHODS,
  MENU_TEST_IDS,
  PALETTE_TYPES,
  PLAYFIELD_TEST_IDS,
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
  waitForMenu,
  waitForPlayfield,
} from './helpers';

/** Expects each id to be rendered exactly once. */
async function expectEachOnce(page: Page, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await expect(byTestId(page, id), `exactly one [data-testid="${id}"]`).toHaveCount(1);
  }
}

/** Expects none of the ids to be rendered. */
async function expectNone(page: Page, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await expect(byTestId(page, id), `no [data-testid="${id}"]`).toHaveCount(0);
  }
}

/** True when `window.__DIORAMA__` is the object first seen on this page. */
function sameHookAsFirst(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as { __DIORAMA__?: unknown; __e2eFirstHook?: unknown };
    if (w.__e2eFirstHook === undefined) w.__e2eFirstHook = w.__DIORAMA__;
    return w.__DIORAMA__ !== undefined && w.__DIORAMA__ === w.__e2eFirstHook;
  });
}

/** Names of the hook's own properties whose value is a function, sorted. */
function hookFunctionNames(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    const h = window.__DIORAMA__ as unknown as Record<string, unknown> | undefined;
    if (typeof h !== 'object' || h === null) return null;
    return Object.keys(h).filter((k) => typeof h[k] === 'function').sort();
  });
}

const SORTED_METHODS = [...HOOK_METHODS].sort();

test.describe('window.__DIORAMA__ with ?test=1', () => {
  test('is defined with all 10 methods when the main menu first appears', async ({ page }) => {
    // Record the hook's state at the exact moment the menu element first
    // enters the DOM, and whether a playfield showed up before it.
    await page.addInitScript(() => {
      const w = window as unknown as { __e2eAtMenu?: unknown };
      const observer = new MutationObserver(() => {
        if (w.__e2eAtMenu !== undefined) return;
        const playfield = document.querySelector('[data-testid="playfield"]');
        const menu = document.querySelector('[data-testid="main-menu"]');
        if (!menu && !playfield) return;
        const h = (window as unknown as { __DIORAMA__?: Record<string, unknown> }).__DIORAMA__;
        w.__e2eAtMenu = {
          menuFirst: menu !== null && playfield === null,
          hookType: typeof h,
          functions: h ? Object.keys(h).filter((k) => typeof h[k] === 'function').sort() : [],
        };
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    });

    await gotoApp(page, { waitForHook: false });

    const atMenu = await page.evaluate(() => (window as unknown as { __e2eAtMenu?: unknown }).__e2eAtMenu);
    expect(atMenu).toEqual({ menuFirst: true, hookType: 'object', functions: SORTED_METHODS });

    // Every method is callable and answers synchronously on the menu.
    const results = await page.evaluate(() => {
      const h = window.__DIORAMA__!;
      return {
        state: h.getState(),
        connections: h.getConnections(),
        train: h.getTrain(),
        log: h.getSoundLog(),
        stateIsPromise: (h.getState() as unknown) instanceof Promise,
      };
    });
    expect(results.stateIsPromise).toBe(false);
    expect(results.state.mode).toBe('build');
    expect(results.connections).toEqual([]);
    expect(results.train).toBeNull();
    expect(Array.isArray(results.log)).toBe(true);
  });

  test('stays defined, as the same object, across menu and playfield navigation', async ({ page }) => {
    const saved = makeDiorama({ name: 'Navigation check' });
    await seedStorage(page, { [SAVE_KEY]: makeSaveFile([saved]) });
    await gotoApp(page);

    expect(await sameHookAsFirst(page)).toBe(true);
    expect(await hookFunctionNames(page)).toEqual(SORTED_METHODS);

    for (let round = 0; round < 2; round++) {
      // Menu → new diorama → menu (a fresh diorama is clean, so no dialog).
      await openNewDiorama(page);
      expect(await sameHookAsFirst(page)).toBe(true);
      expect(await hookFunctionNames(page)).toEqual(SORTED_METHODS);
      expect((await getState(page)).dioramaId).toBeNull();
      await byTestId(page, 'back-to-menu').click();
      await waitForMenu(page);
      expect(await sameHookAsFirst(page)).toBe(true);

      // Menu → saved diorama → menu.
      await byTestId(page, 'diorama-open').click();
      await waitForPlayfield(page);
      expect(await sameHookAsFirst(page)).toBe(true);
      const state = await getState(page);
      expect(state.dioramaId).toBe(saved.id);
      expect(state.dioramaName).toBe(saved.name);
      await byTestId(page, 'back-to-menu').click();
      await waitForMenu(page);
      expect(await sameHookAsFirst(page)).toBe(true);
      expect(await hookFunctionNames(page)).toEqual(SORTED_METHODS);
    }
  });
});

test.describe('production build without ?test=1', () => {
  test('never defines window.__DIORAMA__ on any screen', async ({ page }) => {
    // Trap any assignment for the whole page lifetime, not only at the checks.
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__e2eHookAssigned = false;
      for (const key of ['__DIORAMA__', '__DIORAMA_DEBUG__']) {
        let value: unknown;
        Object.defineProperty(window, key, {
          configurable: true,
          get: () => value,
          set: (v) => {
            w.__e2eHookAssigned = true;
            value = v;
          },
        });
      }
    });
    const hookChunkRequests: string[] = [];
    page.on('request', (req) => {
      if (/installTestHook/i.test(req.url())) hookChunkRequests.push(req.url());
    });

    await gotoApp(page, { test: false });
    const hookType = () => page.evaluate(() => [typeof window.__DIORAMA__, typeof window.__DIORAMA_DEBUG__]);
    expect(await hookType()).toEqual(['undefined', 'undefined']);

    await openNewDiorama(page);
    expect(await hookType()).toEqual(['undefined', 'undefined']);

    await byTestId(page, 'back-to-menu').click();
    await waitForMenu(page);
    expect(await hookType()).toEqual(['undefined', 'undefined']);

    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__e2eHookAssigned)).toBe(false);
    expect(hookChunkRequests).toEqual([]);
  });
});

test.describe('Section 10.1 test ids', () => {
  test('main menu, empty state: menu ids once each, no entries, no playfield ids', async ({ page }) => {
    await gotoApp(page);
    await expect(page).toHaveTitle('Track');
    await expectEachOnce(page, MENU_TEST_IDS);
    await expect(byTestId(page, 'diorama-item')).toHaveCount(0);
    await expectNone(page, [...ENTRY_TEST_IDS, 'rename-input', 'confirm-ok', 'confirm-discard', ...PLAYFIELD_TEST_IDS]);
  });

  test('main menu with saved entries: one item per diorama with its controls, rename input and delete dialog', async ({ page }) => {
    const older = makeDiorama({ name: 'Older layout', updatedAt: '2026-10-01T09:00:00.000Z', createdAt: '2026-10-01T09:00:00.000Z' });
    const newer = makeDiorama({ name: 'Newer layout', updatedAt: '2026-10-02T09:00:00.000Z', createdAt: '2026-10-01T08:00:00.000Z' });
    await seedStorage(page, { [SAVE_KEY]: makeSaveFile([older, newer]) });
    await gotoApp(page);

    await expect(page).toHaveTitle('Track');
    await expectEachOnce(page, MENU_TEST_IDS);

    const items = byTestId(page, 'diorama-item');
    await expect(items).toHaveCount(2);
    // Newest first, each carrying its SaveFile id.
    await expect(items.nth(0)).toHaveAttribute('data-diorama-id', newer.id);
    await expect(items.nth(1)).toHaveAttribute('data-diorama-id', older.id);
    for (let i = 0; i < 2; i++) {
      for (const id of ENTRY_TEST_IDS) {
        await expect(items.nth(i).locator(`[data-testid="${id}"]`)).toHaveCount(1);
      }
    }
    for (const id of ENTRY_TEST_IDS) await expect(byTestId(page, id)).toHaveCount(2);
    await expectNone(page, ['rename-input', 'confirm-ok', 'confirm-discard', ...PLAYFIELD_TEST_IDS]);

    // Rename input: exactly one while renaming.
    await items.nth(0).locator('[data-testid="diorama-rename"]').click();
    await expect(byTestId(page, 'rename-input')).toHaveCount(1);
    await expect(byTestId(page, 'rename-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(byTestId(page, 'rename-input')).toHaveCount(0);

    // Delete dialog: one confirm-ok, no discard button.
    await items.nth(1).locator('[data-testid="diorama-delete"]').click();
    await expect(byTestId(page, 'confirm-ok')).toHaveCount(1);
    await expect(byTestId(page, 'confirm-ok')).toHaveText(/Delete/);
    await expect(byTestId(page, 'confirm-discard')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(byTestId(page, 'confirm-ok')).toHaveCount(0);
    await expect(items).toHaveCount(2);
    await expect(page).toHaveTitle('Track');
  });

  test('playfield: every control id once, kept while disabled and in Play mode; toast and unsaved-changes dialog', async ({ page }) => {
    await gotoApp(page);
    await openNewDiorama(page);

    await expect(page).toHaveTitle('Track');
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');
    await expectEachOnce(page, PLAYFIELD_TEST_IDS);
    await expectNone(page, [...MENU_TEST_IDS, 'diorama-item', ...ENTRY_TEST_IDS, 'rename-input', 'confirm-ok', 'confirm-discard']);
    // Disabled in Build mode, still carrying its id.
    await expect(byTestId(page, 'drive-toggle')).toBeDisabled();

    // A station disables its palette item; the id stays.
    expect((await hook(page, 'placePiece', 'station', 7, 7)).ok).toBe(true);
    await expect(byTestId(page, 'palette-station')).toHaveAttribute('aria-disabled', 'true');
    await expectEachOnce(page, PALETTE_TYPES.map((t) => `palette-${t}`));

    // Play mode: data-mode follows the store; disabled controls keep their ids.
    expect(await hook(page, 'setMode', 'play')).toEqual({ ok: true });
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'play');
    await expect(byTestId(page, 'flip-direction')).toBeDisabled();
    await expect(byTestId(page, 'palette-straight')).toBeDisabled();
    await expectEachOnce(page, PLAYFIELD_TEST_IDS);
    expect(await hook(page, 'setMode', 'build')).toEqual({ ok: true });
    await expect(byTestId(page, 'playfield')).toHaveAttribute('data-mode', 'build');

    // Save shows a toast carrying the message.
    await byTestId(page, 'save-button').click();
    await expect(byTestId(page, 'toast').filter({ hasText: 'Saved' })).toHaveCount(1);

    // Unsaved changes: one confirm-ok (Save) and one confirm-discard.
    expect((await hook(page, 'placePiece', 'straight', 7, 8)).ok).toBe(true);
    await byTestId(page, 'back-to-menu').click();
    await expect(byTestId(page, 'confirm-ok')).toHaveCount(1);
    await expect(byTestId(page, 'confirm-ok')).toHaveText(/Save/);
    await expect(byTestId(page, 'confirm-discard')).toHaveCount(1);
    await expect(byTestId(page, 'playfield')).toHaveCount(1);
    await byTestId(page, 'confirm-discard').click();

    await waitForMenu(page);
    await expect(page).toHaveTitle('Track');
    await expectNone(page, [...PLAYFIELD_TEST_IDS, 'confirm-ok', 'confirm-discard']);
    // The earlier save is listed.
    await expect(byTestId(page, 'diorama-item')).toHaveCount(1);
  });
});
