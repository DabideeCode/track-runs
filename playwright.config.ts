import { defineConfig } from '@playwright/test'

/** Set PW_BROWSER=firefox or webkit to run the suite there. Chrome is the default. */
const browserName = process.env.PW_BROWSER as 'firefox' | 'webkit' | undefined

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1920, height: 1080 },
    ...(browserName
      ? { browserName }
      : {
          channel: 'chrome',
          launchOptions: {
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
          },
        }),
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
  },
})
