import { expect, test } from './fixtures';

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
]) {
  test(`overlays stay within 25% at ${viewport.width} by ${viewport.height}`, async ({ app, page }) => {
    await page.setViewportSize(viewport);
    await app.open();
    await app.openPlayfield();

    const covered = await page.evaluate(() => {
      const panels = [...document.querySelectorAll('header, nav[aria-label="Palette"], section[aria-label="Sound"]')];
      return panels.reduce((total, panel) => {
        const { width, height } = panel.getBoundingClientRect();
        return total + width * height;
      }, 0);
    });
    expect(covered / (viewport.width * viewport.height)).toBeLessThanOrEqual(0.25);

    const canvas = (await page.locator('canvas').boundingBox())!;
    expect(canvas.width).toBe(viewport.width);
    expect(canvas.height).toBe(viewport.height);
  });
}
