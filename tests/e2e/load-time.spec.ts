import { expect, test } from '@playwright/test';

const MBPS_25 = (25 * 1000 * 1000) / 8;

test('a first visit at 25 Mbps can start building within 5 seconds', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Network throttling needs the Chrome DevTools Protocol');
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 20,
    downloadThroughput: MBPS_25,
    uploadThroughput: MBPS_25,
  });

  const start = Date.now();
  await page.goto('/?test=1');
  await expect(page.getByTestId('new-diorama')).toBeVisible();
  const menu = Date.now() - start;
  await page.getByTestId('new-diorama').click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
  const playable = Date.now() - start;
  console.log(`menu ${menu} ms, playable ${playable} ms`);
  expect(playable).toBeLessThan(5000);
});
