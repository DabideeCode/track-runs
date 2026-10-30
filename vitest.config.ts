import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Unit, property and component tests. Playwright owns tests/e2e.
// Node is the default environment; component tests opt in to jsdom with
// a `// @vitest-environment jsdom` comment at the top of the file.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
      exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
      passWithNoTests: true,
      // Property tests (100+ fast-check runs over long action sequences) take a
      // few seconds each and exceed the 5 s default when the full suite runs
      // in parallel workers.
      testTimeout: 30_000,
    },
  }),
);
