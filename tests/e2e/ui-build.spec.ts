/**
 * Building with the real UI (task 18.3): pointer and keyboard input on the
 * palette and the 3D canvas, checked through the test hook.
 *
 * Board positions come from `window.__DIORAMA_DEBUG__.tileToScreen` (through
 * the helpers), taken after the camera has settled. No test orbits or pans
 * the camera (only the left button is used on the board, plus one right
 * click that must not move it), so projections stay valid for the whole test.
 *
 * Tiles are picked near the middle of the default view, away from the
 * palette (left) and the top bar, so every pointer action lands on the
 * canvas. Decorations are used where a test should not depend on track
 * auto-adjust or snapping.
 *
 * Requirements: 9.10, 11.2, 11.3, 11.8, 12.1, 12.2, 12.4, 12.6, 13.3, 13.4, 25.1
 */
import type { Page } from '@playwright/test';
import type { GameState, PieceType } from '@/domain/types';
import {
  byTestId,
  clickTile,
  dragPaletteToTile,
  dragTileToTile,
  expect,
  getSoundLog,
  getState,
  gotoApp,
  hook,
  openNewDiorama,
  test,
  tileToScreen,
} from './helpers';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/** Returns a function giving the sound events logged since this call. */
async function soundsSince(page: Page): Promise<() => Promise<string[]>> {
  const start = (await getSoundLog(page)).length;
  return async () => (await getSoundLog(page)).slice(start);
}

/** Presses the left button on a palette item (no release). */
async function pressPalette(page: Page, type: PieceType): Promise<void> {
  const box = await byTestId(page, `palette-${type}`).boundingBox();
  if (!box) throw new Error(`palette-${type} is not visible`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

/** Presses the left button on a tile centre (no release). */
async function pressTile(page: Page, gridX: number, gridZ: number): Promise<void> {
  const p = await tileToScreen(page, gridX, gridZ);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
}

/** Moves the pointer in steps to a tile centre (button state unchanged). */
async function moveToTile(page: Page, gridX: number, gridZ: number): Promise<void> {
  const p = await tileToScreen(page, gridX, gridZ);
  await page.mouse.move(p.x, p.y, { steps: 12 });
}

/** Places a piece through the hook and returns its id. */
async function placeViaHook(page: Page, type: PieceType, gridX: number, gridZ: number): Promise<string> {
  const r = await hook(page, 'placePiece', type, gridX, gridZ);
  expect(r.ok, `placePiece(${type}, ${gridX}, ${gridZ})`).toBe(true);
  return r.id!;
}

function piecesOf(state: GameState) {
  return state.pieces;
}

const UNDO = 'ControlOrMeta+z';
const REDO = 'ControlOrMeta+Shift+z';

// Stepped pointer moves over a WebGL canvas are slow when several browsers
// render at once (parallel runners, software GL), so allow more than 30 s.
test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await openNewDiorama(page);
});

// ---------------------------------------------------------------------------
// Placing from the palette
// ---------------------------------------------------------------------------

test.describe('palette', () => {
  test('click selects the tool; clicks on tiles place it and keep it selected', async ({ page }) => {
    const sounds = await soundsSince(page);

    await byTestId(page, 'palette-straight').click();
    expect((await getState(page)).selectedTool).toBe('straight');
    await expect(byTestId(page, 'palette-straight')).toHaveAttribute('aria-pressed', 'true');
    expect(await sounds()).toEqual(['ui']);

    // Valid tile: one straight with its anchor on the clicked tile (11.3, 11.7).
    await clickTile(page, 7, 7);
    let state = await getState(page);
    expect(state.pieces).toHaveLength(1);
    expect(state.pieces[0]).toMatchObject({ type: 'straight', gridX: 7, gridZ: 7, rotation: 0 });
    expect(state.selectedTool).toBe('straight');
    expect(state.isDirty).toBe(true);
    expect(await sounds()).toEqual(['ui', 'place']);

    // Occupied tile: rejected with `invalid`; the tool stays (11.3, 11.10).
    await clickTile(page, 7, 7);
    state = await getState(page);
    expect(state.pieces).toHaveLength(1);
    expect(state.selectedTool).toBe('straight');
    expect(await sounds()).toEqual(['ui', 'place', 'invalid']);

    // Another valid tile: a second piece with a different id.
    await clickTile(page, 10, 6);
    state = await getState(page);
    expect(state.pieces).toHaveLength(2);
    expect(state.pieces[1]).toMatchObject({ type: 'straight', gridX: 10, gridZ: 6 });
    expect(state.pieces[1].id).not.toBe(state.pieces[0].id);
    expect(state.selectedTool).toBe('straight');
  });

  test('drag and drop places on the release tile with pickup and place sounds', async ({ page }) => {
    const sounds = await soundsSince(page);

    await dragPaletteToTile(page, 'house', 8, 6);
    const state = await getState(page);
    expect(state.pieces).toHaveLength(1);
    expect(state.pieces[0]).toMatchObject({ type: 'house', gridX: 8, gridZ: 6, rotation: 0 });
    // A palette drag also selects the tool (10.3).
    expect(state.selectedTool).toBe('house');
    expect(await sounds()).toEqual(['pickup', 'place']);
  });

  test('a drop on an occupied tile or off the grid places nothing and plays invalid', async ({ page }) => {
    await placeViaHook(page, 'house', 8, 6);
    const before = piecesOf(await getState(page));
    const sounds = await soundsSince(page);

    // Occupied tile.
    await dragPaletteToTile(page, 'pineTree', 8, 6);
    expect(piecesOf(await getState(page))).toEqual(before);
    expect(await sounds()).toEqual(['pickup', 'invalid']);

    // Over the grid, then back over the palette panel and released there.
    await pressPalette(page, 'roundTree');
    await moveToTile(page, 9, 8);
    const box = await byTestId(page, 'palette-blocks').boundingBox();
    if (!box) throw new Error('palette-blocks is not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    expect(piecesOf(await getState(page))).toEqual(before);
    expect(await sounds()).toEqual(['pickup', 'invalid', 'pickup', 'invalid']);
  });

  test('R during a palette drag turns the ghost; the drop uses that rotation', async ({ page }) => {
    const sounds = await soundsSince(page);

    await pressPalette(page, 'house');
    await moveToTile(page, 9, 7);
    await page.keyboard.press('r');
    await page.keyboard.press('r');
    await page.mouse.up();

    const state = await getState(page);
    expect(state.pieces).toHaveLength(1);
    expect(state.pieces[0]).toMatchObject({ type: 'house', gridX: 9, gridZ: 7, rotation: 180 });
    expect(await sounds()).toEqual(['pickup', 'rotate', 'rotate', 'place']);
  });
});

// ---------------------------------------------------------------------------
// Pieces on the board
// ---------------------------------------------------------------------------

test.describe('board', () => {
  test('dragging a placed piece moves it to the release tile, keeping its id', async ({ page }) => {
    const id = await placeViaHook(page, 'house', 6, 8);
    const sounds = await soundsSince(page);

    await dragTileToTile(page, { gridX: 6, gridZ: 8 }, { gridX: 9, gridZ: 9 });

    const state = await getState(page);
    expect(state.pieces).toEqual([{ id, type: 'house', gridX: 9, gridZ: 9, rotation: 0 }]);
    // A board drag selects the dragged piece.
    expect(state.selectedPieceId).toBe(id);
    expect(await sounds()).toEqual(['pickup', 'move']);
  });

  test('R during a board drag turns the piece; Escape returns it to where it started', async ({ page }) => {
    const id = await placeViaHook(page, 'house', 9, 9);
    const sounds = await soundsSince(page);

    // Rotated while dragged, then released: moved and turned (12.2, 12.5).
    await pressTile(page, 9, 9);
    await moveToTile(page, 7, 6);
    await page.keyboard.press('r');
    await page.mouse.up();
    expect(piecesOf(await getState(page))).toEqual([{ id, type: 'house', gridX: 7, gridZ: 6, rotation: 90 }]);
    expect(await sounds()).toEqual(['pickup', 'rotate', 'move']);

    // Rotated while dragged, then Escape: back at its start tile and rotation (12.9).
    await pressTile(page, 7, 6);
    await moveToTile(page, 10, 8);
    await page.keyboard.press('r');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(piecesOf(await getState(page))).toEqual([{ id, type: 'house', gridX: 7, gridZ: 6, rotation: 90 }]);
    expect(await sounds()).toEqual(['pickup', 'rotate', 'move', 'pickup', 'rotate']);
  });

  test('click selects a piece; R rotates it in place; Delete and Backspace remove it', async ({ page }) => {
    const a = await placeViaHook(page, 'house', 7, 9);
    const b = await placeViaHook(page, 'car', 10, 6);
    const sounds = await soundsSince(page);

    // Click with no tool selects (12.1).
    await clickTile(page, 7, 9);
    expect((await getState(page)).selectedPieceId).toBe(a);

    // R: 0 → 90 → 180, same tile (12.4).
    await page.keyboard.press('r');
    await page.keyboard.press('r');
    let state = await getState(page);
    expect(state.pieces.find((p) => p.id === a)).toEqual({ id: a, type: 'house', gridX: 7, gridZ: 9, rotation: 180 });
    expect(await sounds()).toEqual(['rotate', 'rotate']);

    // Delete removes exactly the selected piece and clears the selection (12.6).
    await page.keyboard.press('Delete');
    state = await getState(page);
    expect(state.pieces.map((p) => p.id)).toEqual([b]);
    expect(state.selectedPieceId).toBeNull();
    expect(await sounds()).toEqual(['rotate', 'rotate', 'delete']);

    // Nothing selected: R and Delete change nothing and log nothing (12.10).
    await page.keyboard.press('r');
    await page.keyboard.press('Delete');
    expect((await getState(page)).pieces.map((p) => p.id)).toEqual([b]);
    expect(await sounds()).toEqual(['rotate', 'rotate', 'delete']);

    // Backspace deletes too.
    await clickTile(page, 10, 6);
    expect((await getState(page)).selectedPieceId).toBe(b);
    await page.keyboard.press('Backspace');
    state = await getState(page);
    expect(state.pieces).toEqual([]);
    expect(state.selectedPieceId).toBeNull();
    expect(await sounds()).toEqual(['rotate', 'rotate', 'delete', 'delete']);
  });
});

// ---------------------------------------------------------------------------
// Escape
// ---------------------------------------------------------------------------

test('Escape cancels a palette drag, then clears the tool, then clears the selection', async ({ page }) => {
  const id = await placeViaHook(page, 'house', 6, 6);
  await clickTile(page, 6, 6);
  expect((await getState(page)).selectedPieceId).toBe(id);
  const before = piecesOf(await getState(page));
  const sounds = await soundsSince(page);

  // 1. During a drag: the drag ends, nothing is placed, even on release (11.8).
  await pressPalette(page, 'pineTree');
  await moveToTile(page, 9, 7);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  let state = await getState(page);
  expect(state.pieces).toEqual(before);
  expect(state.selectedTool).toBe('pineTree');
  expect(state.selectedPieceId).toBe(id);
  expect(await sounds()).toEqual(['pickup']);

  // 2. No drag, a tool selected: the tool is cleared (11.9); the selection stays.
  await page.keyboard.press('Escape');
  state = await getState(page);
  expect(state.selectedTool).toBeNull();
  expect(state.selectedPieceId).toBe(id);
  await expect(byTestId(page, 'palette-pineTree')).toHaveAttribute('aria-pressed', 'false');

  // 3. No drag, no tool: the selection is cleared.
  await page.keyboard.press('Escape');
  state = await getState(page);
  expect(state.selectedPieceId).toBeNull();
  expect(state.pieces).toEqual(before);
  expect(await sounds()).toEqual(['pickup']);
});

// ---------------------------------------------------------------------------
// Undo and redo
// ---------------------------------------------------------------------------

test('Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes place, move, rotate and delete', async ({ page }) => {
  const snapshots: GameState['pieces'][] = [piecesOf(await getState(page))];
  const record = async () => snapshots.push(piecesOf(await getState(page)));

  // Place by tool click, then clear the tool so the board can be dragged.
  await byTestId(page, 'palette-house').click();
  await clickTile(page, 7, 7);
  await record();
  await page.keyboard.press('Escape');
  const id = snapshots[1][0].id;

  // Move by board drag (selects the piece).
  await dragTileToTile(page, { gridX: 7, gridZ: 7 }, { gridX: 9, gridZ: 8 });
  await record();
  // Rotate with R.
  await page.keyboard.press('r');
  await record();
  // Delete with Delete.
  await page.keyboard.press('Delete');
  await record();

  expect(snapshots).toEqual([
    [],
    [{ id, type: 'house', gridX: 7, gridZ: 7, rotation: 0 }],
    [{ id, type: 'house', gridX: 9, gridZ: 8, rotation: 0 }],
    [{ id, type: 'house', gridX: 9, gridZ: 8, rotation: 90 }],
    [],
  ]);

  // Undo walks back one action at a time (13.3).
  for (let i = snapshots.length - 2; i >= 0; i--) {
    await page.keyboard.press(UNDO);
    expect(piecesOf(await getState(page)), `after undo back to step ${i}`).toEqual(snapshots[i]);
  }
  // Nothing left to undo: no change.
  await page.keyboard.press(UNDO);
  expect(piecesOf(await getState(page))).toEqual([]);

  // Redo replays them with the same ids and values (13.4).
  for (let i = 1; i < snapshots.length; i++) {
    await page.keyboard.press(REDO);
    expect(piecesOf(await getState(page)), `after redo to step ${i}`).toEqual(snapshots[i]);
  }
  // Nothing left to redo: no change.
  await page.keyboard.press(REDO);
  expect(piecesOf(await getState(page))).toEqual([]);
  expect((await getState(page)).isDirty).toBe(true);
});

// ---------------------------------------------------------------------------
// Right button
// ---------------------------------------------------------------------------

test('a right click over the canvas opens no context menu and changes nothing', async ({ page }) => {
  await placeViaHook(page, 'house', 8, 8);
  const before = await getState(page);
  const at = await tileToScreen(page, 8, 8);

  // Record, after every app listener has run, whether the default was prevented.
  await page.evaluate(() => {
    const w = window as unknown as { __e2eMenus: { prevented: boolean; onCanvas: boolean }[] };
    w.__e2eMenus = [];
    window.addEventListener('contextmenu', (e) => {
      w.__e2eMenus.push({ prevented: e.defaultPrevented, onCanvas: e.target instanceof HTMLCanvasElement });
    });
  });

  await page.mouse.click(at.x, at.y, { button: 'right' });

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __e2eMenus: unknown[] }).__e2eMenus))
    .toEqual([{ prevented: true, onCanvas: true }]);

  // A right click is not a build gesture: no selection, no piece change.
  const after = await getState(page);
  expect(after.pieces).toEqual(before.pieces);
  expect(after.selectedPieceId).toBeNull();
  // The camera did not move: the tile projects to the same point.
  const again = await tileToScreen(page, 8, 8);
  expect(Math.abs(again.x - at.x)).toBeLessThan(1);
  expect(Math.abs(again.y - at.y)).toBeLessThan(1);
});
