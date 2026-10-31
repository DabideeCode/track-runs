import { expect, test } from '@playwright/test';

test.describe('US7: hook gating in the production build', () => {
  test('absent without ?test=1', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('undefined');
  });

  test('absent with another value', async ({ page }) => {
    await page.goto('/?test=0');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('undefined');
  });

  test('present with ?test=1', async ({ page }) => {
    await page.goto('/?test=1');
    await expect(page.getByTestId('main-menu')).toBeVisible();
    expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('object');
  });
});
