/**
 * Applies the registered content packages to the database DATABASE_URL names: their seeds on a new database, their
 * updates on an existing one. Packages only, never the test data. A deploy does the same through migrate.ts.
 *
 * Usage: bun db:packages (the .env database), or bun --env-file=<file> scripts/db/apply-packages.ts
 */

import { applyPackages } from "@/database/packages/runner.ts";
import { db } from "@/server/database/index.ts";

console.log("Applying content packages...");
await applyPackages(db);
console.log("Done.");
process.exit(0);
