import { expect, test } from './fixtures';

test('the production build exposes the hook only with ?test=1', async ({ app, page }) => {
  await app.open('/');
  expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('undefined');

  await app.open('/?test=2');
  expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('undefined');

  await app.open('/?test=1');
  expect(await page.evaluate(() => typeof window.__DIORAMA__)).toBe('object');
});
