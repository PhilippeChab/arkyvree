import { reportCoverage } from '@/tests/e2e/coverage.ts';

/** Ends the run: reports the client's coverage, when the run recorded it (`E2E_COVERAGE=1`). */
async function globalTeardown() {
  await reportCoverage();
}

export default globalTeardown;
