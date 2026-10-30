// Times a cold first load on a throttled 25 Mbps connection, from navigation until the board is
// ready to place on. Usage: start `npm run preview -- --port 4173`, then run `node tests/perf/load.mjs`.
import { chromium } from '@playwright/test';

const MBPS = 25;
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: (MBPS * 1_000_000) / 8,
  uploadThroughput: (MBPS * 1_000_000) / 8,
});

const start = Date.now();
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?test=1`, { waitUntil: 'commit' });
await page.getByTestId('new-diorama').waitFor();
const menuReady = Date.now() - start;
await page.getByTestId('new-diorama').click();
await page.waitForSelector('canvas');
await page.waitForFunction(() => window.__TRACK_PROJECT__(0, 0, 0).x > 0);
const playable = Date.now() - start;

const bytes = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .reduce((total, entry) => total + entry.encodedBodySize, 0),
);
console.log(JSON.stringify({ menuReadyMs: menuReady, playableMs: playable, transferredMB: +(bytes / 1048576).toFixed(2) }));
await browser.close();
