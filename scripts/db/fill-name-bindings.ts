/**
 * Gives every modifier and requirement saved before its names were kept what those names mean (`fillNameBindings`),
 * on the database DATABASE_URL names. A seed, a package update and a migration run it themselves; this runs it alone.
 *
 * Usage: bun --env-file=<file> scripts/db/fill-name-bindings.ts
 */

import { db } from "@/server/database/index.ts";

import fillNameBindings from "./fillNameBindings.ts";

console.log(`Done: ${await fillNameBindings(db)} rows bound.`);
process.exit(0);
