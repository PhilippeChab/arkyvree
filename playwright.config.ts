import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve } from 'path';

/**
 * Read environment variables from test environment file
 */
dotenv.config({ path: resolve(process.cwd(), '.env.test') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['html'], ['list'], ['github']]
    : [['html'], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5175',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup project - runs before all tests
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // Journey tests - comprehensive end-to-end workflows (no auth state, each test creates its own users)
    {
      name: 'journeys',
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
      testMatch: /journeys\/.*\.e2e\.ts/,
    },

    // Authenticated user tests (campaigns, characters, protected routes)
    {
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared auth state
        storageState: 'tests/fixtures/.auth/user.json',
      },
      dependencies: ['setup'],
      testMatch: /profile\/.*\.e2e\.ts|session\/.*\.e2e\.ts|navigation\/protected-routes\.e2e\.ts/,
    },

    // Guest/unauthenticated user tests (sign-in, sign-up, redirect tests)
    {
      name: 'guest',
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
      testMatch: /auth\/.*\.e2e\.ts|navigation\/unauthenticated-redirect\.e2e\.ts/,
    },
  ],

  /* Run test servers on separate ports (8001/5174) to avoid conflicts with dev servers (8000/5173) */
  webServer: [
    {
      // WSL2 mirrored-networking mode silently drops TCP RSTs on 127.0.0.1
      // for closed ports — Playwright's pre-spawn probe hangs the full timeout
      // before starting the server. IPv6 ::1 is unaffected.
      // https://github.com/microsoft/WSL/issues/13327
      // HOST=:: makes Bun.serve dual-stack (binds both v4 + v6 loopback).
      command: 'HOST=:: bun --env-file=.env.test run dev:server',
      url: 'http://[::1]:8001',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // Always use vite dev. `vite preview` serves the production build
      // which strips `data-testid` from MUI icons (test selectors break).
      // The separate `build` CI job already validates the production bundle.
      // --host :: matches the IPv6 loopback used by the Playwright probe.
      command: 'API_PORT=8001 FEATUREBASE_ENABLED=false bun vite --port 5175 --host ::',
      url: 'http://[::1]:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],

  /* Global setup and teardown */
  globalSetup: './tests/fixtures/global.setup.ts',
  globalTeardown: './tests/fixtures/global.teardown.ts',

  /* Per-test timeout. 60s gives heavier journey tests slack under parallel
   * worker load while still failing fast on real hangs. Specific multi-step
   * tests can call test.setTimeout() for more. */
  timeout: 60 * 1000,
});
