import { defineConfig } from '@playwright/test';

/**
 * These are unit tests over pure main-process modules (matching, keyword
 * extraction, metadata parsing) — they never open a page, so there is nothing to
 * gain from running them against three browser engines. Playwright is used here
 * purely as the test runner, since it is already a dependency.
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  projects: [{ name: 'node' }],
});
