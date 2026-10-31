import { expect, type Page } from '@playwright/test';
import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_FOV, defaultCameraPosition } from '../../../src/domain/camera';
import { tileToWorld } from '../../../src/domain/grid';
import type { GameState, PieceType, Rotation } from '../../../src/domain/types';
import type { DioramaTestHook } from '../../../src/testing/testHook';

export type Hook = DioramaTestHook;

export async function openApp(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await expect(page.getByTestId('main-menu')).toBeVisible();
}

export async function openNewDiorama(page: Page): Promise<void> {
  await openApp(page);
  await page.getByTestId('new-diorama').click();
  await expect(page.getByTestId('playfield')).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  // The first frame hands the camera to the pointer controller.
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
}

export function gameState(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__DIORAMA__!.getState());
}

export function soundLog(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__DIORAMA__!.getSoundLog());
}

export function hook<T>(page: Page, fn: (h: Hook) => T): Promise<T> {
  return page.evaluate(`(${fn.toString()})(window.__DIORAMA__)`) as Promise<T>;
}

export function place(page: Page, type: PieceType, x: number, z: number, rotation?: Rotation) {
  return page.evaluate(
    ([t, gx, gz, r]) => window.__DIORAMA__!.placePiece(t as PieceType, gx as number, gz as number, r as Rotation | undefined),
    [type, x, z, rotation] as const,
  );
}

/** Screen position of a tile centre under the default camera. */
export function tileToScreen(page: Page, x: number, z: number): { x: number; y: number } {
  const viewport = page.viewportSize()!;
  const camera = new PerspectiveCamera(CAMERA_FOV, viewport.width / viewport.height, 0.1, 200);
  camera.position.set(...defaultCameraPosition());
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const world = tileToWorld({ x, z });
  const ndc = new Vector3(world.x, 0, world.z).project(camera);
  return {
    x: ((ndc.x + 1) / 2) * viewport.width,
    y: ((1 - ndc.y) / 2) * viewport.height,
  };
}

export async function dragFromPalette(page: Page, type: PieceType, x: number, z: number): Promise<void> {
  const box = (await page.getByTestId(`palette-${type}`).boundingBox())!;
  const target = tileToScreen(page, x, z);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 5, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
}

export async function dragTile(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const start = tileToScreen(page, from[0], from[1]);
  const end = tileToScreen(page, to[0], to[1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 4, { steps: 2 });
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
}

export async function clickTile(page: Page, x: number, z: number): Promise<void> {
  const point = tileToScreen(page, x, z);
  await page.mouse.click(point.x, point.y);
}
