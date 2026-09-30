import type { BrowserContext, Page } from '@playwright/test';
import MCR, { type CoverageReportOptions } from 'monocart-coverage-reports';

/**
 * The client's coverage by the journeys, when a run sets `E2E_COVERAGE=1`: Chromium's JavaScript coverage of each
 * test's page, mapped through the build's inline source maps back to client/src (whose files no page loaded count
 * as uncovered), and reported at the end of the run in coverage/e2e: a summary in the console, per-file figures in
 * coverage-summary.json, the details in index.html. A test's own `page` is recorded, and the pages of the contexts
 * it opens with `openContext` (another user's, a guest's) until they're closed; a document the app itself replaces (a
 * full-page redirect) loses its coverage.
 */
const COVERAGE = process.env.E2E_COVERAGE === '1';

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
 * Starts recording the client code `page` runs, and returns what stops it and keeps what it recorded. A new document
 * drops the previous one's coverage (its scripts are collected), so the page's coverage is taken before each load it's
 * given: `goto` and `reload`.
 */
async function recordPage(page: Page) {
  const start = () => page.coverage.startJSCoverage({ resetOnNavigation: false });
  const add = async () => {
    const entries = await page.coverage.stopJSCoverage();
    // A page that hasn't loaded anything yet (about:blank) has none
    if (entries.length) await MCR(options).add(entries);
  };
  const take = async () => {
    await add();
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
  // A page the test closed took its coverage with it
  return async () => {
    if (!page.isClosed()) await add();
  };
}

/** Records the client code the test's `page` runs until `run` ends. */
export async function recordCoverage(page: Page, run: () => Promise<void>) {
  if (!COVERAGE) return run();
  const stop = await recordPage(page);
  await run();
  await stop();
}

/** Records the pages of a browser context a test opens itself (another user's, a guest's), until it's closed. */
export function recordContext(context: BrowserContext) {
  if (!COVERAGE) return context;
  const stops: (() => Promise<void>)[] = [];
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    stops.push(await recordPage(page));
    return page;
  };
  const close = context.close.bind(context);
  context.close = async (closeOptions) => {
    for (const stop of stops) await stop();
    return close(closeOptions);
  };
  return context;
}

/** Reports the run's coverage. */
export async function reportCoverage() {
  if (COVERAGE) await MCR(options).generate();
}
