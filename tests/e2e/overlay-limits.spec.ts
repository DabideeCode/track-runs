import { expect, test, type Page } from '@playwright/test';
import { openApp, openNewDiorama, tileToScreen } from './helpers/app';

async function overlayShare(page: Page): Promise<number> {
  return page.evaluate(() => {
    const panels = [...document.querySelectorAll('[data-overlay-panel]')];
    const area = panels.reduce((sum, panel) => {
      const { width, height } = panel.getBoundingClientRect();
      return sum + width * height;
    }, 0);
    return area / (window.innerWidth * window.innerHeight);
  });
}

async function unobstructed(page: Page, x: number, z: number): Promise<boolean> {
  const point = tileToScreen(page, x, z);
  return page.evaluate(
    ({ x: px, y: py }) => document.elementFromPoint(px, py)?.tagName === 'CANVAS',
    point,
  );
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
]) {
  test.describe(`at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test('panels cover no more than 25% of the viewport in Build mode', async ({ page }) => {
      await openNewDiorama(page);
      const share = await overlayShare(page);
      console.log(`overlay share ${viewport.width}: ${(share * 100).toFixed(1)}%`);
      expect(share).toBeGreaterThan(0.02);
      expect(share).toBeLessThanOrEqual(0.25);
    });

    test('the whole grid is visible and reachable by default', async ({ page }) => {
      await openNewDiorama(page);
      for (const [x, z] of [
        [0, 0],
        [15, 0],
        [0, 15],
        [15, 15],
        [8, 8],
      ] as const) {
        const point = tileToScreen(page, x, z);
        expect(point.x).toBeGreaterThan(0);
        expect(point.x).toBeLessThan(viewport.width);
        expect(point.y).toBeGreaterThan(0);
        expect(point.y).toBeLessThan(viewport.height);
        expect(await unobstructed(page, x, z), `tile ${x},${z}`).toBe(true);
      }
    });
  });
}

test.describe('accessibility', () => {
  async function names(page: Page) {
    return page.evaluate(() =>
      [...document.querySelectorAll('button, select, input')]
        .filter((element) => {
          const text = element.textContent?.trim();
          const label = element.getAttribute('aria-label');
          const title = element.getAttribute('title');
          return !text && !label && !title;
        })
        .map((element) => element.outerHTML.slice(0, 80)),
    );
  }

  test('every control has an accessible name', async ({ page }) => {
    await openApp(page);
    expect(await names(page)).toEqual([]);
    await page.getByTestId('new-diorama').click();
    await expect(page.getByTestId('playfield')).toBeVisible();
    expect(await names(page)).toEqual([]);
  });

  test('controls can be reached by keyboard and show a visible focus ring', async ({ page }) => {
    await openNewDiorama(page);
    await page.locator('body').click({ position: { x: 900, y: 500 } });
    const seen = new Set<string>();
    for (let press = 0; press < 30; press++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        return {
          id: element.dataset.testid ?? element.tagName,
          outline: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      if (!focused) continue;
      seen.add(focused.id);
      expect(focused.outline, focused.id).not.toBe('none');
      expect(focused.width, focused.id).toBeGreaterThan(0);
    }
    for (const id of ['palette-straight', 'mode-toggle', 'flip-direction', 'save-button', 'back-to-menu', 'reset-view', 'setting-select', 'mute-toggle', 'music-volume', 'sfx-volume']) {
      expect([...seen], id).toContain(id);
    }
  });

  test('the disabled station explains why', async ({ page }) => {
    await openNewDiorama(page);
    await page.evaluate(() => window.__DIORAMA__!.placePiece('station', 4, 4, 0));
    const box = (await page.getByTestId('palette-station').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('tooltip')).toContainText('station');
  });
});
