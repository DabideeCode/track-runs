import { test as base, expect } from '@playwright/test';

/**
 * Page fixture that fails the test if the page logs any console error or
 * throws an uncaught exception (Requirement 40.4). Warnings are allowed.
 * Import `test` and `expect` from this file instead of '@playwright/test'.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const loc = msg.location();
        errors.push(`console.error: ${msg.text()} (${loc.url}:${loc.lineNumber})`);
      }
    });
    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err.message}`);
    });

    await use(page);

    expect(errors, 'the page must log no console errors or uncaught exceptions').toEqual([]);
  },
});

export { expect };
