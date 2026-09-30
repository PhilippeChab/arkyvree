import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { databaseOf, withDatabase } from './scripts/db/clone-database.ts';

/**
 * Read environment variables from test environment file
 */
dotenv.config({ path: resolve(process.cwd(), '.env.test') });

/*
 * The run has a database of its own: a copy of the seeded test database (`bun run test:db:reset` refreshes it), made
 * when the server starts, so the unit tests' template never holds what the journeys write. Its name keeps "test",
 * which turns off the rate limits. The workers inherit the environment, so this runs once.
 */
process.env.TEMPLATE_DATABASE_URL ??= process.env.DATABASE_URL;
process.env.DATABASE_URL = withDatabase(process.env.TEMPLATE_DATABASE_URL!, `${databaseOf(process.env.TEMPLATE_DATABASE_URL!).name}_e2e`);

/** The server the run starts: the API, its websocket, and the built client, served as in production. */
const port = process.env.PORT ?? '8001';
process.env.E2E_BASE_URL = `http://localhost:${port}`;

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
  /*
   * Locally half the cores: each worker drives its own browser against the one server and database. Setup goes
   * through the API and pages are the built client, so that leaves the machine usable. Override for one run with
   * `--workers N`.
   */
  workers: process.env.CI ? 2 : '50%',
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['html'], ['list'], ['github']]
    : [['html'], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: process.env.E2E_BASE_URL,
    /* The built client registers a service worker: it would cache across a test's pages and serve stale bundles. */
    serviceWorkers: 'block',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video on failure */
    video: 'retain-on-failure',
  },

  projects: [
    // Signed-in tests: each signs in itself, through the API, as users of its own (tests/e2e/fixtures.ts)
    {
      name: 'journeys',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /journeys\/.*\.e2e\.ts/,
    },

    // Signed-out tests: sign-in, sign-up, redirects
    {
      name: 'guest',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: /auth\/.*\.e2e\.ts|navigation\/unauthenticated-redirect\.e2e\.ts/,
    },
  ],

  webServer: {
    /*
     * Builds the client (a couple of seconds; `E2E_SKIP_BUILD=1` reuses dist/), copies the database, then serves both.
     * `E2E_COVERAGE=1` builds with inline source maps, which the coverage report maps back to client/src.
     * WSL2 mirrored networking drops TCP RSTs on 127.0.0.1 for closed ports, so Playwright's probe would hang until
     * the timeout: it checks [::1], and HOST=:: makes Bun.serve bind both loopbacks.
     * https://github.com/microsoft/WSL/issues/13327
     */
    command: [
      ...process.env.E2E_SKIP_BUILD ? [] : [`bunx vite build${process.env.E2E_COVERAGE ? ' --sourcemap inline' : ''}`],
      'bun scripts/db/clone-database.ts',
      'HOST=:: bun server/main.ts',
    ].join(' && '),
    url: `http://[::1]:${port}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },

  /* Global setup and teardown */
  globalSetup: './tests/fixtures/global.setup.ts',
  globalTeardown: './tests/fixtures/global.teardown.ts',

  /* Per-test timeout. 60s gives heavier journey tests slack under parallel
   * worker load while still failing fast on real hangs. Specific multi-step
   * tests can call test.setTimeout() for more. */
  timeout: 60 * 1000,
});
