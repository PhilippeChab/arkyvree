import { startCoverage } from '@/tests/e2e/coverage.ts';

/**
 * Prepares the run. The server's start copied the seeded database, and each test signs in as users of its own, so
 * there's nothing to reset or share: this only starts the client's coverage, when the run records it.
 */
async function globalSetup() {
  await startCoverage();
}

export default globalSetup;
