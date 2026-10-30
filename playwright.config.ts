import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production bundle served by `vite preview`.
// Tests add `?test=1` to URLs themselves to expose window.__DIORAMA__
// (see tests/e2e/helpers.ts).
//
// Parallel runners (D-62): several Playwright processes can run at once if
// each sets its own
//   E2E_PORT     port for `vite preview` (default 4173)
//   E2E_OUT_DIR  build output folder (default `dist`), e.g. `dist-e2e-hook`
// for example `E2E_PORT=4181 E2E_OUT_DIR=dist-e2e-hook npx playwright test ...`.
// With a custom E2E_OUT_DIR the Playwright artefacts go to
// `test-results-<dir>` instead of `test-results`, because Playwright empties
// its output folder when it starts.
//
// The web server builds with `vite build` only. Type checking stays in
// `npm run build` and `npx tsc -b`; running `tsc -b` here would type-check
// every test file, so one runner's half-written spec could stop another
// runner's server from starting.
const PORT = Number.parseInt(process.env.E2E_PORT ?? '', 10) || 4173;
const OUT_DIR = process.env.E2E_OUT_DIR?.trim() || 'dist';
const RESULTS_DIR = OUT_DIR === 'dist' ? 'test-results' : `test-results-${OUT_DIR.replace(/[^\w.-]/g, '_')}`;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  outputDir: RESULTS_DIR,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx vite build --outDir ${OUT_DIR} && npx vite preview --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
