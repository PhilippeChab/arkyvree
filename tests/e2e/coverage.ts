import type { Page } from '@playwright/test';
import MCR, { type CoverageReportOptions } from 'monocart-coverage-reports';

/**
 * The client's coverage by the journeys, when a run sets `E2E_COVERAGE=1`: Chromium's JavaScript coverage of each
 * test's page, mapped through the build's inline source maps back to client/src (whose files no page loaded count
 * as uncovered), and reported at the end of the run in coverage/e2e: a summary in the console, per-file figures in
 * coverage-summary.json, the details in index.html.
 */
const COVERAGE = !!process.env.E2E_COVERAGE;

const options: CoverageReportOptions = {
  name: 'Client coverage by the e2e journeys',
  outputDir: 'coverage/e2e',
  reports: ['console-summary', 'json-summary', 'v8'],
  // The built client's chunks, of which its own sources (not its dependencies')
  entryFilter: (entry) => entry.url.includes('/assets/'),
  // Its TypeScript files: a dependency's source map can name a .js file under client/src that doesn't exist
  sourceFilter: (sourcePath) => /^client\/src\/.*\.tsx?$/.test(sourcePath),
  // The files no page loaded count too, as uncovered
  all: { dir: ['client/src'], filter: (filePath) => /\.tsx?$/.test(filePath) && !filePath.endsWith('.d.ts') },
};

/** Starts a run's coverage: forgets the previous run's. */
export async function startCoverage() {
  if (COVERAGE) await MCR(options).cleanCache();
}

/**
 * Records the client code `page` runs until `run` ends. A new document drops the previous one's coverage (its scripts
 * are collected), so the page's coverage is taken before each load it's given: `goto` and `reload`.
 */
export async function recordCoverage(page: Page, run: () => Promise<void>) {
  if (!COVERAGE) return run();
  const start = () => page.coverage.startJSCoverage({ resetOnNavigation: false });
  const take = async () => {
    await MCR(options).add(await page.coverage.stopJSCoverage());
    await start();
  };
  const goto = page.goto.bind(page);
  const reload = page.reload.bind(page);
  page.goto = async (url, gotoOptions) => {
    await take();
    return goto(url, gotoOptions);
  };
  page.reload = async (reloadOptions) => {
    await take();
    return reload(reloadOptions);
  };
  await start();
  await run();
  await MCR(options).add(await page.coverage.stopJSCoverage());
}

/** Reports the run's coverage. */
export async function reportCoverage() {
  if (COVERAGE) await MCR(options).generate();
}
