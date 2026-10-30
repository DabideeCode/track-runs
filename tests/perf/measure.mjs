// Measures frame rate with 100 pieces at 1920 x 1080 in the production build.
// Usage: start `npm run preview -- --port 4173`, then run `node tests/perf/measure.mjs`.
// A readPixels call each frame makes the GPU finish its work, so the result reflects real render
// cost and not only how often the browser schedules frames. DPR and PORT can be set in the environment.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'],
});
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: Number(process.env.DPR ?? 1.5),
});
await page.goto(`http://localhost:${process.env.PORT ?? 4173}/?test=1`);
await page.getByTestId('new-diorama').click();
await page.waitForSelector('canvas');
await page.waitForTimeout(1500);

const renderer = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

const placed = await page.evaluate(() => {
  const hook = window.__DIORAMA__;
  const types = ['house', 'pineTree', 'roundTree', 'car', 'cassette', 'blocks', 'tunnel', 'buffer', 'curve', 'straight'];
  hook.placePiece('station', 8, 12, 0);
  for (let z = 11; z >= 4; z -= 1) hook.placePiece('straight', 8, z, 0);
  hook.placePiece('buffer', 8, 3, 0);
  let count = 10;
  for (let z = 0; z < 16 && count < 100; z += 1) {
    for (let x = 0; x < 16 && count < 100; x += 1) {
      if (x === 8) continue;
      if (hook.placePiece(types[(x + z) % types.length], x, z, 0).ok) count += 1;
    }
  }
  return hook.getState().pieces.length;
});

async function measure(seconds) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const gl = document.querySelector('canvas').getContext('webgl2');
        const pixel = new Uint8Array(4);
        const times = [];
        const start = performance.now();
        const frame = (now) => {
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          times.push(now);
          if (now - start < duration * 1000) requestAnimationFrame(frame);
          else {
            const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
            resolve({
              fps: Math.round(((times.length - 1) / (now - start)) * 10000) / 10,
              worstGapMs: Math.round(gaps[gaps.length - 1]),
              p95GapMs: Math.round(gaps[Math.floor(gaps.length * 0.95)]),
            });
          }
        };
        requestAnimationFrame(frame);
      }),
    seconds,
  );
}

await page.waitForTimeout(2000);
const build = await measure(10);
await page.evaluate(() => window.__DIORAMA__.setMode('play'));
await page.waitForTimeout(1000);
const play = await measure(10);
console.log(JSON.stringify({ renderer, placed, dpr: await page.evaluate(() => devicePixelRatio), build, play }, null, 2));
await browser.close();
