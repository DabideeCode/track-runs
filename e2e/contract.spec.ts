import { expect, test } from '@playwright/test'
import {
  buildLine,
  buildLoop,
  clickTile,
  collectConsoleErrors,
  dragPaletteToTile,
  dragTileToTile,
  gameState,
  newDiorama,
  openApp,
  sounds,
  testId,
  tileToScreen,
  train,
  worldToScreen,
} from './helpers'

const ALL_TYPES = [
  'straight',
  'curve',
  'tunnel',
  'station',
  'buffer',
  'house',
  'pineTree',
  'roundTree',
  'hill',
  'car',
  'cassette',
  'blocks',
]

test.describe('main menu', () => {
  test('opens on the menu with the app name and an empty state', async ({ page }) => {
    await openApp(page)
    await expect(page).toHaveTitle('Track')
    await expect(page.getByRole('heading', { name: 'Track', exact: true })).toBeVisible()
    await expect(testId(page, 'diorama-list')).toContainText(/create/i)
    await expect(testId(page, 'diorama-item')).toHaveCount(0)
  })

  test('new diorama opens empty in build on the bedroom floor', async ({ page }) => {
    await newDiorama(page)
    await expect(testId(page, 'playfield')).toHaveAttribute('data-mode', 'build')
    expect(await gameState(page)).toMatchObject({
      pieces: [],
      mode: 'build',
      setting: 'bedroom',
      startFacing: 0,
      dioramaName: 'Untitled diorama',
      isDirty: false,
    })
  })

  test('numbers new dioramas around taken names', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'save-button').click()
    await testId(page, 'back-to-menu').click()
    await testId(page, 'new-diorama').click()
    await expect(testId(page, 'playfield')).toBeVisible()
    expect((await gameState(page)).dioramaName).toBe('Untitled diorama 2')
  })
})

test.describe('palette', () => {
  test('lists all twelve items in two groups', async ({ page }) => {
    await newDiorama(page)
    for (const type of ALL_TYPES) await expect(testId(page, `palette-${type}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tracks' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Decorations' })).toBeVisible()
  })

  test('selecting an item stores it and highlights it', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'palette-house').click()
    expect((await gameState(page)).selectedTool).toBe('house')
    await expect(testId(page, 'palette-house')).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    expect((await gameState(page)).selectedTool).toBeNull()
  })

  test('disables the station once placed, with an explanation', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('station', 3, 3, 0))
    const item = testId(page, 'palette-station')
    await expect(item).toBeDisabled()
    await item.locator('..').hover({ force: true })
    await expect(page.getByRole('tooltip')).toContainText(/station/i)
  })
})

test.describe('placing with the pointer', () => {
  test('drag from the palette places exactly one piece on the tile', async ({ page }) => {
    await newDiorama(page)
    await dragPaletteToTile(page, 'straight', 8, 8)
    await page.mouse.up()
    const { pieces } = await gameState(page)
    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toMatchObject({ type: 'straight', gridX: 8, gridZ: 8 })
    expect(await sounds(page)).toEqual(expect.arrayContaining(['pickup', 'place']))
  })

  test('tiles across the whole grid map correctly', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'palette-car').click()
    for (const [x, z] of [
      [3, 2],
      [14, 2],
      [8, 7],
      [14, 13],
      [4, 13],
    ]) {
      await clickTile(page, x, z)
    }
    const { pieces } = await gameState(page)
    expect(pieces.map((piece) => [piece.gridX, piece.gridZ])).toEqual([
      [3, 2],
      [14, 2],
      [8, 7],
      [14, 13],
      [4, 13],
    ])
  })

  test('releasing off the grid cancels with the invalid sound', async ({ page }) => {
    await newDiorama(page)
    const box = (await testId(page, 'palette-house').boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    const off = worldToScreen(page, 11, 3)
    await page.mouse.move(off.x, off.y, { steps: 8 })
    await page.mouse.up()
    expect((await gameState(page)).pieces).toHaveLength(0)
    expect(await sounds(page)).toContain('invalid')
  })

  test('releasing back over the palette cancels', async ({ page }) => {
    await newDiorama(page)
    const box = (await testId(page, 'palette-house').boundingBox())!
    await page.mouse.move(box.x + 20, box.y + 20)
    await page.mouse.down()
    await page.mouse.move(box.x + 60, box.y + 60, { steps: 4 })
    await page.mouse.up()
    expect((await gameState(page)).pieces).toHaveLength(0)
    expect((await gameState(page)).selectedTool).toBeNull()
  })

  test('releasing on an occupied tile cancels', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('straight', 8, 8, 0))
    await dragPaletteToTile(page, 'house', 8, 8)
    await page.mouse.up()
    expect((await gameState(page)).pieces).toHaveLength(1)
    expect(await sounds(page)).toContain('invalid')
  })

  test('escape cancels a drag from the palette', async ({ page }) => {
    await newDiorama(page)
    await dragPaletteToTile(page, 'house', 8, 8)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect((await gameState(page)).pieces).toHaveLength(0)
  })

  test('clicking a tile with a tool places it, and R turns the ghost', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'palette-straight').click()
    const point = tileToScreen(page, 7, 7)
    await page.mouse.move(point.x, point.y)
    await page.keyboard.press('r')
    await page.mouse.click(point.x, point.y)
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 7, gridZ: 7, rotation: 90 })
  })

  test('auto-adjust turns a dropped track to connect', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('straight', 8, 8, 90))
    await dragPaletteToTile(page, 'straight', 9, 8)
    await page.mouse.up()
    const { pieces } = await gameState(page)
    expect(pieces[1].rotation).toBe(90)
    expect(await sounds(page)).toEqual(expect.arrayContaining(['place', 'snap']))
  })

  test('right and middle buttons never place or select', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'palette-car').click()
    const point = tileToScreen(page, 8, 8)
    await page.mouse.click(point.x, point.y, { button: 'right' })
    await page.mouse.click(point.x, point.y, { button: 'middle' })
    expect((await gameState(page)).pieces).toHaveLength(0)
  })
})

test.describe('editing placed pieces', () => {
  test('click selects, Delete removes', async ({ page }) => {
    await newDiorama(page)
    const id = await page.evaluate(() => window.__DIORAMA__!.placePiece('house', 8, 8, 0).id!)
    await clickTile(page, 8, 8)
    expect((await gameState(page)).selectedPieceId).toBe(id)
    await page.keyboard.press('Delete')
    expect((await gameState(page)).pieces).toHaveLength(0)
    expect(await sounds(page)).toContain('delete')
  })

  test('the overlay delete button and Backspace both remove', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => {
      window.__DIORAMA__!.placePiece('car', 8, 8, 0)
      window.__DIORAMA__!.placePiece('car', 9, 8, 0)
    })
    await clickTile(page, 8, 8)
    await testId(page, 'delete-piece').click()
    await clickTile(page, 9, 8)
    await page.keyboard.press('Backspace')
    expect((await gameState(page)).pieces).toHaveLength(0)
  })

  test('clicking empty ground clears the selection', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    await clickTile(page, 8, 8)
    await clickTile(page, 3, 3)
    expect((await gameState(page)).selectedPieceId).toBeNull()
  })

  test('dragging moves a piece and plays the move sound', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    await dragTileToTile(page, [8, 8], [11, 5])
    await page.mouse.up()
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 11, gridZ: 5 })
    expect(await sounds(page)).toContain('move')
  })

  test('an invalid drop returns the piece to its tile and rotation', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => {
      window.__DIORAMA__!.placePiece('straight', 8, 8, 0)
      window.__DIORAMA__!.placePiece('house', 11, 5, 0)
    })
    await dragTileToTile(page, [8, 8], [11, 5])
    await page.keyboard.press('r')
    await page.mouse.up()
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 8, gridZ: 8, rotation: 0 })
    await expect
      .poll(async () => (await sounds(page)).filter((name) => name === 'invalid').length)
      .toBe(1)
  })

  test('R rotates the selected piece clockwise', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('curve', 8, 8, 0))
    await clickTile(page, 8, 8)
    await page.keyboard.press('r')
    expect((await gameState(page)).pieces[0].rotation).toBe(90)
    expect(await sounds(page)).toContain('rotate')
  })

  test('undo and redo', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    await page.keyboard.press('Control+z')
    expect((await gameState(page)).pieces).toHaveLength(0)
    await page.keyboard.press('Control+Shift+z')
    expect((await gameState(page)).pieces).toHaveLength(1)
  })

  test('the delete control is disabled without a selection', async ({ page }) => {
    await newDiorama(page)
    await expect(testId(page, 'delete-piece')).toBeDisabled()
  })
})

test.describe('hook contract', () => {
  test('returns reason codes and connection pairs', async ({ page }) => {
    await newDiorama(page)
    const results = await page.evaluate(() => {
      const hook = window.__DIORAMA__!
      const a = hook.placePiece('straight', 2, 2, 0)
      const b = hook.placePiece('straight', 2, 3, 0)
      return {
        a,
        b,
        occupied: hook.placePiece('straight', 2, 2, 0),
        onTrack: hook.placePiece('house', 2, 2, 0),
        outside: hook.placePiece('hill', 15, 15, 0),
        noStation: hook.setMode('play'),
        missing: hook.removePiece('ghost'),
        connections: hook.getConnections(),
      }
    })
    expect(results.occupied).toEqual({ ok: false, reason: 'occupied' })
    expect(results.onTrack).toEqual({ ok: false, reason: 'on_track' })
    expect(results.outside).toEqual({ ok: false, reason: 'out_of_bounds' })
    expect(results.noStation).toEqual({ ok: false, reason: 'no_station' })
    expect(results.missing).toEqual({ ok: false, reason: 'not_found' })
    expect(results.connections).toEqual([[results.a.id, results.b.id]])
  })

  test('is not exposed without ?test=1 in a production build', async ({ page }) => {
    await page.goto('/')
    await expect(testId(page, 'main-menu')).toBeVisible()
    expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('undefined')
  })
})

test.describe('play mode', () => {
  test('refuses to start without a station', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'mode-toggle').click()
    await expect(testId(page, 'toast')).toContainText('Place a station to start')
    await expect(testId(page, 'playfield')).toHaveAttribute('data-mode', 'build')
  })

  test('starts in auto, whistles, runs a loop, and hides the palette', async ({ page }) => {
    await newDiorama(page)
    const station = await buildLoop(page)
    expect(await train(page)).toMatchObject({ pieceId: station, moving: false })

    await testId(page, 'mode-toggle').click()
    await expect(testId(page, 'playfield')).toHaveAttribute('data-mode', 'play')
    expect((await gameState(page)).driveMode).toBe('auto')
    await expect.poll(async () => (await train(page))?.speed).toBeGreaterThan(1.4)
    expect(await sounds(page)).toEqual(expect.arrayContaining(['whistle', 'chug']))
    await expect(testId(page, 'palette-straight')).toBeHidden()
    await expect(testId(page, 'palette-straight')).toBeDisabled()

    const refused = await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 1, 1, 0))
    expect(refused).toEqual({ ok: false, reason: 'play_mode' })

    await testId(page, 'mode-toggle').click()
    await expect(testId(page, 'playfield')).toHaveAttribute('data-mode', 'build')
    expect(await train(page)).toMatchObject({ pieceId: station, moving: false, speed: 0 })
  })

  test('auto stops at a buffer, pauses, then reverses', async ({ page }) => {
    await newDiorama(page)
    const { buffer } = await buildLine(page)
    await page.evaluate(() => window.__DIORAMA__!.setMode('play'))
    await expect
      .poll(async () => await train(page), { timeout: 15_000 })
      .toMatchObject({ pieceId: buffer, moving: false })
    expect(await sounds(page)).toContain('bump')
    await expect
      .poll(async () => (await train(page))?.direction, { timeout: 5_000 })
      .toBe('reverse')
  })

  test('manual drives with W and S and stops on release', async ({ page }) => {
    await newDiorama(page)
    await buildLoop(page)
    await testId(page, 'mode-toggle').click()
    await testId(page, 'drive-toggle').click()
    expect((await gameState(page)).driveMode).toBe('manual')
    await expect.poll(async () => (await train(page))?.moving).toBe(false)

    await page.keyboard.down('w')
    await expect.poll(async () => (await train(page))?.speed).toBeGreaterThan(1.9)
    expect((await train(page))?.direction).toBe('forward')
    await page.keyboard.up('w')
    await expect.poll(async () => (await train(page))?.moving).toBe(false)

    await page.keyboard.down('s')
    await expect.poll(async () => (await train(page))?.speed).toBeGreaterThan(1.9)
    expect((await train(page))?.direction).toBe('reverse')
    await page.keyboard.up('s')
  })

  test('flip direction changes the facing and stays editable in build only', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'flip-direction').click()
    expect((await gameState(page)).startFacing).toBe(180)
    await page.keyboard.press('f')
    expect((await gameState(page)).startFacing).toBe(0)
  })
})

test.describe('saving', () => {
  test('saves, survives a reload and reopens identically', async ({ page }) => {
    await newDiorama(page)
    await buildLoop(page)
    await page.keyboard.press('f')
    await testId(page, 'setting-select').click()
    await page.getByRole('option', { name: 'Kitchen table' }).click()
    expect((await gameState(page)).setting).toBe('kitchen')
    await testId(page, 'save-button').click()
    await expect(testId(page, 'toast')).toContainText(/saved/i)
    const before = await gameState(page)
    expect(before.isDirty).toBe(false)

    await page.reload()
    await testId(page, 'diorama-open').click()
    await expect(testId(page, 'playfield')).toBeVisible()
    const after = await gameState(page)
    expect(after.pieces).toEqual(before.pieces)
    expect(after).toMatchObject({ setting: 'kitchen', startFacing: 180, mode: 'build' })
  })

  test('stores the Section 9 format with a thumbnail', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('house', 8, 8, 0))
    await testId(page, 'save-button').click()
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wooden-diorama:v1') ?? 'null'),
    )
    expect(saved.version).toBe(1)
    expect(saved.dioramas).toHaveLength(1)
    expect(saved.dioramas[0]).toMatchObject({ name: 'Untitled diorama', setting: 'bedroom' })
    expect(saved.dioramas[0].thumbnail).toMatch(/^data:image\/jpeg/)
  })

  test('leaving with changes offers save, discard and cancel', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))

    await testId(page, 'back-to-menu').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(testId(page, 'playfield')).toBeVisible()

    await testId(page, 'back-to-menu').click()
    await testId(page, 'confirm-discard').click()
    await expect(testId(page, 'main-menu')).toBeVisible()
    await expect(testId(page, 'diorama-item')).toHaveCount(0)

    await testId(page, 'new-diorama').click()
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    await testId(page, 'back-to-menu').click()
    await testId(page, 'confirm-ok').click()
    await expect(testId(page, 'main-menu')).toBeVisible()
    await expect(testId(page, 'diorama-item')).toHaveCount(1)
  })

  test('leaving without changes goes straight to the menu', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'back-to-menu').click()
    await expect(testId(page, 'main-menu')).toBeVisible()
  })

  test('keyboard shortcuts stay out of a confirmation dialog', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    await clickTile(page, 8, 8)
    await testId(page, 'back-to-menu').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Delete')
    await page.keyboard.press('r')
    await page.keyboard.press('f')
    expect((await gameState(page)).pieces[0]).toMatchObject({ rotation: 0 })
    expect((await gameState(page)).startFacing).toBe(0)
  })

  test('renames and deletes from the menu, newest first', async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('wooden-diorama:v1')) return
      const entry = (id: string, updatedAt: string) => ({
        id,
        name: `Layout ${id}`,
        setting: 'bedroom',
        startFacing: 0,
        pieces: [],
        createdAt: updatedAt,
        updatedAt,
      })
      localStorage.setItem(
        'wooden-diorama:v1',
        JSON.stringify({
          version: 1,
          dioramas: [entry('old', '2026-01-01T10:00:00Z'), entry('new', '2026-03-01T10:00:00Z')],
        }),
      )
    })
    await openApp(page)
    const items = testId(page, 'diorama-item')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveAttribute('data-diorama-id', 'new')

    await items.nth(1).getByTestId('diorama-rename').click()
    const input = testId(page, 'rename-input')
    await input.fill('   ')
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText(/name/i)
    await input.fill('x'.repeat(41))
    await input.press('Enter')
    await expect(page.getByRole('alert')).toContainText(/40/)
    await input.fill('Sunny loop')
    await input.press('Enter')
    await expect(page.getByText('Sunny loop')).toBeVisible()

    await items.first().getByTestId('diorama-delete').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await testId(page, 'confirm-ok').click()
    await expect(items).toHaveCount(1)
  })

  test('corrupt data never crashes the menu', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem(
        'wooden-diorama:v1',
        JSON.stringify({
          version: 1,
          dioramas: [
            { id: 'bad', name: 3 },
            {
              id: 'good',
              name: 'Good',
              setting: 'kitchen',
              startFacing: 0,
              pieces: [],
              createdAt: '2026-01-01T10:00:00Z',
              updatedAt: '2026-01-01T10:00:00Z',
            },
          ],
        }),
      )
    })
    await openApp(page)
    await expect(testId(page, 'diorama-item')).toHaveCount(1)
    expect(warnings.some((text) => text.includes('corrupt'))).toBe(true)
    expect(errors).toEqual([])
  })

  test('survives unparseable storage', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('wooden-diorama:v1', '{oops'))
    await openApp(page)
    await expect(testId(page, 'diorama-item')).toHaveCount(0)
  })
})

test.describe('settings and audio', () => {
  test('offers exactly the two settings without moving pieces', async ({ page }) => {
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    await testId(page, 'setting-select').click()
    await expect(page.getByRole('option')).toHaveCount(2)
    await page.getByRole('option', { name: 'Kitchen table' }).click()
    expect((await gameState(page)).pieces[0]).toMatchObject({ gridX: 8, gridZ: 8 })
  })

  test('mute and volumes persist across sessions', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'mute-toggle').click()
    await testId(page, 'music-volume').focus()
    await page.keyboard.press('ArrowLeft')
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wooden-diorama:audio') ?? 'null'),
    )
    expect(stored).toMatchObject({ muted: true, musicVolume: 0.4, sfxVolume: 0.8 })
    await page.reload()
    await expect(testId(page, 'mute-toggle')).toHaveAttribute('aria-pressed', 'true')
  })

  test('audio waits for the first gesture, then music and effects load', async ({ page }) => {
    await openApp(page)
    const audio = () =>
      page.evaluate(() => {
        const { Howler } = window as never as {
          Howler: {
            ctx?: AudioContext
            _howls: { state(): string; playing(): boolean; _src: string | string[] }[]
          }
        }
        return {
          context: Howler.ctx?.state ?? null,
          loaded: Howler._howls.filter((howl) => howl.state() === 'loaded').length,
          total: Howler._howls.length,
          music: Howler._howls.some(
            (howl) => String(howl._src).includes('life-of-riley') && howl.playing(),
          ),
        }
      })
    expect(await audio()).toMatchObject({ context: null, total: 0 })

    await testId(page, 'new-diorama').click()
    // Playwright's WebKit build has no Web Audio, unlike Safari; Howler then uses HTML5 audio.
    if (await page.evaluate(() => typeof AudioContext !== 'undefined')) {
      await expect.poll(async () => (await audio()).context).toBe('running')
    }
    await expect.poll(async () => await audio()).toMatchObject({ total: 12, loaded: 12 })
    await expect.poll(async () => (await audio()).music).toBe(true)
  })

  test('autosaves unsaved changes every 30 seconds in build mode', async ({ page }) => {
    await page.clock.install()
    await newDiorama(page)
    await page.evaluate(() => window.__DIORAMA__!.placePiece('car', 8, 8, 0))
    expect((await gameState(page)).isDirty).toBe(true)
    await page.clock.fastForward(31_000)
    await expect.poll(async () => (await gameState(page)).isDirty).toBe(false)
    await expect(testId(page, 'toast')).toContainText(/autosaved/i)
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wooden-diorama:v1') ?? 'null'),
    )
    expect(saved.dioramas).toHaveLength(1)
  })

  test('overlay buttons play the UI click', async ({ page }) => {
    await newDiorama(page)
    await testId(page, 'reset-view').click()
    expect(await sounds(page)).toContain('ui')
  })
})

test.describe('look and accessibility', () => {
  test('overlay panels cover no more than 25% of the viewport in build mode', async ({ page }) => {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(viewport)
      await newDiorama(page)
      const covered = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('[data-testid=playfield] .panel')]
        return panels.reduce((sum, panel) => {
          const box = panel.getBoundingClientRect()
          return sum + box.width * box.height
        }, 0)
      })
      expect(covered / (viewport.width * viewport.height)).toBeLessThanOrEqual(0.25)
    }
  })

  test('every overlay control has an accessible name', async ({ page }) => {
    await newDiorama(page)
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role=slider], [role=combobox]')]
        .filter((el) => !(el.getAttribute('aria-label') || el.textContent?.trim()))
        .map((el) => el.outerHTML.slice(0, 100)),
    )
    expect(unnamed).toEqual([])
  })

  test('caps the device pixel ratio at 1.5', async ({ browser }) => {
    const context = await browser.newContext({
      deviceScaleFactor: 3,
      viewport: { width: 800, height: 600 },
    })
    const page = await context.newPage()
    await newDiorama(page)
    const width = await page.evaluate(() => document.querySelector('canvas')!.width)
    expect(width).toBeLessThanOrEqual(1200)
    await context.close()
  })
})

test('a full session logs no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page)
  await newDiorama(page)
  await dragPaletteToTile(page, 'station', 7, 7)
  await page.mouse.up()
  await buildLoop(page)
  await clickTile(page, 7, 7)
  await page.keyboard.press('r')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Control+z')
  await testId(page, 'setting-select').click()
  await page.getByRole('option', { name: 'Kitchen table' }).click()
  await testId(page, 'mode-toggle').click()
  await page.waitForTimeout(800)
  await testId(page, 'drive-toggle').click()
  await testId(page, 'mode-toggle').click()
  await testId(page, 'save-button').click()
  await testId(page, 'back-to-menu').click()
  await expect(testId(page, 'main-menu')).toBeVisible()
  expect(errors).toEqual([])
})
