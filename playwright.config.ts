import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { resolve } from 'path';
import { databaseOf, withDatabase } from './scripts/db/clone-database.ts';

/**
 * Read environment variables from test environment file
 */
dotenv.config({ path: resolve(process.cwd(), '.env.test') });

/** The server the run starts, on a port of its own: the API, its websocket, and the built client, served as in production. */
const port = process.env.E2E_PORT ?? '8010';
process.env.PORT = port;
process.env.E2E_BASE_URL = process.env.APP_URL = `http://localhost:${port}`;

/*
 * The run has a database of its own: a copy, made when its server starts, of the e2e template, which `bun run
 * test:db:reset` copies from the seeded test database. So a run never locks the unit tests' database, nor holds what
 * another run writes: runs on other ports have other copies. Its name keeps "test", which turns off the rate limits.
 * The workers re-read this file with the environment it sets: only the first read derives the names.
 */
process.env.TEMPLATE_DATABASE_URL ??= withDatabase(process.env.DATABASE_URL!, `${databaseOf(process.env.DATABASE_URL!).name}_e2e`);
process.env.DATABASE_URL = withDatabase(process.env.TEMPLATE_DATABASE_URL, `${databaseOf(process.env.TEMPLATE_DATABASE_URL).name}_${port}`);
// The websocket listener prefers a direct URL: it must listen on the run's database too
process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;

const coverage = process.env.E2E_COVERAGE === '1';

/*
 * CI runs the Google Chrome its runners come with, so it installs no browser (whose system packages come from a mirror
 * that can take minutes); locally, Playwright's own Chromium (`bunx playwright install chromium`).
 */
const desktop = { ...devices['Desktop Chrome'], ...process.env.CI ? { channel: 'chrome' } : {} };

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
      use: desktop,
      testMatch: /journeys\/.*\.e2e\.ts/,
    },

    // Signed-out tests: sign-in, sign-up, redirects
    {
      name: 'guest',
      use: desktop,
      testMatch: /auth\/.*\.e2e\.ts|navigation\/unauthenticated-redirect\.e2e\.ts/,
    },
  ],

  webServer: {
    /*
     * Builds the client for production (a couple of seconds; `E2E_SKIP_BUILD=1` reuses dist/), copies the database,
     * then serves both, with .env.test's settings only (not a developer's .env). `E2E_COVERAGE=1` builds with inline
     * source maps, which the coverage report maps back to client/src.
     * WSL2 mirrored networking drops TCP RSTs on 127.0.0.1 for closed ports, so Playwright's probe would hang until
     * the timeout: it checks [::1], and HOST=:: makes Bun.serve bind both loopbacks.
     * https://github.com/microsoft/WSL/issues/13327
     */
    command: [
      ...process.env.E2E_SKIP_BUILD === '1' ? [] : [`NODE_ENV=production bunx vite build${coverage ? ' --sourcemap inline' : ''}`],
      `bun --env-file=.env.test scripts/db/clone-database.ts ${port}`,
      'HOST=:: bun --env-file=.env.test server/main.ts',
    ].join(' && '),
    url: `http://[::1]:${port}/health`,
    // A server already on the port isn't this run's: it would serve another database
    reuseExistingServer: false,
    timeout: 120 * 1000,
    // Its errors, not every request it logs
    stdout: 'ignore',
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
