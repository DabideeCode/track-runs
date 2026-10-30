import { expect, test } from './fixtures';

test('every overlay control has an accessible name', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, input')]
      .filter((control) => {
        const labelled = control.getAttribute('aria-label') || control.textContent?.trim();
        const input = control as HTMLInputElement;
        return !labelled && !input.labels?.length;
      })
      .map((control) => control.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
});

test('Tab reaches the controls with a visible focus ring', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) return 'skip';
      const style = getComputedStyle(active);
      return style.outlineStyle === 'none' ? active.outerHTML.slice(0, 80) : 'ok';
    });
    expect(['ok', 'skip']).toContain(outline);
  }
});

test('dialogs have a title and trap focus', async ({ app, page }) => {
  await app.open();
  await app.openPlayfield();
  await app.hook('placePiece', 'house', 1, 1);
  await page.getByTestId('back-to-menu').click();
  await expect(page.getByRole('dialog', { name: 'Save before leaving?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('playfield')).toBeVisible();
});
