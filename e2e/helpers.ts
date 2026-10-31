import { expect, type Page } from '@playwright/test'
import * as THREE from 'three'
import { DEFAULT_CAMERA_FOV, DEFAULT_POSITION, DEFAULT_TARGET } from '../src/scene/cameraDefaults'
import type { DioramaTestHook } from '../src/game/testHook'

declare global {
  interface Window {
    __DIORAMA__?: DioramaTestHook
  }
}

export const testId = (page: Page, id: string) => page.getByTestId(id)

export const collectConsoleErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

export const openApp = async (page: Page) => {
  await page.goto('/?test=1')
  await expect(testId(page, 'main-menu')).toBeVisible()
}

export const newDiorama = async (page: Page) => {
  await openApp(page)
  await testId(page, 'new-diorama').click()
  await expect(testId(page, 'playfield')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  // The palette previews mean the scene has loaded.
  await expect(testId(page, 'palette-straight').locator('img')).toBeVisible({ timeout: 20_000 })
}

/** Screen position of a world point under the default camera. */
export const worldToScreen = (page: Page, x: number, z: number, y = 0) => {
  const size = page.viewportSize()!
  const camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, size.width / size.height, 0.5, 160)
  camera.position.copy(DEFAULT_POSITION)
  camera.lookAt(DEFAULT_TARGET)
  camera.updateMatrixWorld()
  const point = new THREE.Vector3(x, y, z).project(camera)
  return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height }
}

export const tileToScreen = (page: Page, gridX: number, gridZ: number) =>
  worldToScreen(page, gridX - 7.5, gridZ - 7.5)

export const dragPaletteToTile = async (page: Page, type: string, gridX: number, gridZ: number) => {
  const box = (await testId(page, `palette-${type}`).boundingBox())!
  const target = tileToScreen(page, gridX, gridZ)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 3 })
  await page.mouse.move(target.x, target.y, { steps: 8 })
}

export const dragTileToTile = async (
  page: Page,
  from: [number, number],
  to: [number, number],
) => {
  const start = tileToScreen(page, ...from)
  const end = tileToScreen(page, ...to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 12, start.y + 4, { steps: 3 })
  await page.mouse.move(end.x, end.y, { steps: 8 })
}

export const clickTile = async (page: Page, gridX: number, gridZ: number) => {
  const point = tileToScreen(page, gridX, gridZ)
  await page.mouse.click(point.x, point.y)
}

export const gameState = (page: Page) => page.evaluate(() => window.__DIORAMA__!.getState())

export const sounds = (page: Page) => page.evaluate(() => window.__DIORAMA__!.getSoundLog())

export const train = (page: Page) => page.evaluate(() => window.__DIORAMA__!.getTrain())

/** A rectangular loop with the station on its west side. */
export const buildLoop = (page: Page) =>
  page.evaluate(() => {
    const hook = window.__DIORAMA__!
    hook.placePiece('curve', 4, 4, 0)
    for (let x = 5; x <= 9; x++) hook.placePiece('straight', x, 4, 90)
    hook.placePiece('curve', 10, 4, 90)
    for (let z = 5; z <= 7; z++) hook.placePiece(z === 6 ? 'tunnel' : 'straight', 10, z, 0)
    hook.placePiece('curve', 10, 8, 180)
    for (let x = 9; x >= 5; x--) hook.placePiece('straight', x, 8, 90)
    hook.placePiece('curve', 4, 8, 270)
    hook.placePiece('straight', 4, 7, 0)
    hook.placePiece('straight', 4, 5, 0)
    return hook.placePiece('station', 4, 6, 0).id!
  })

/** A north-south line at x = 8 from z = 2 to z = 13, station at z = 9, buffer at the top. */
export const buildLine = (page: Page) =>
  page.evaluate(() => {
    const hook = window.__DIORAMA__!
    const station = hook.placePiece('station', 8, 9, 0).id!
    const buffer = hook.placePiece('buffer', 8, 2, 0).id!
    for (let z = 3; z <= 13; z++) if (z !== 9) hook.placePiece('straight', 8, z, 0)
    return { station, buffer }
  })
