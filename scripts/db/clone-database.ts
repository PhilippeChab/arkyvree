/**
 * Copies a test database into others, replacing them, which takes a fraction of a second where seeding takes several:
 * the seeded test database into the unit tests' worker databases and the e2e template, and the e2e template into an e2e
 * run's own database.
 *
 * Usage: bun --env-file=.env.test scripts/db/clone-database.ts <suffix>
 *   Copies $TEMPLATE_DATABASE_URL's database (by default $DATABASE_URL's) into <its name>_<suffix>.
 */

import { cloneDatabase, databaseOf } from "./databases.ts";

async function main() {
  const template = process.env.TEMPLATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const suffix = process.argv[2];
  if (!template || !suffix) {
    throw new Error(
      "Usage: bun scripts/db/clone-database.ts <suffix>, with DATABASE_URL (or TEMPLATE_DATABASE_URL) the database to copy",
    );
  }
  const target = `${databaseOf(template).name}_${suffix}`;
  await cloneDatabase(template, [target]);
  console.log(`Copied ${databaseOf(template).name} into ${target}`);
}

await main();
