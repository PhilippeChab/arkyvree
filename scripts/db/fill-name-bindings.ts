/**
 * Gives every modifier and requirement that has none what the names in its paths mean (`writeNameBindings`), in every
 * ruleset of the database DATABASE_URL names: the one step a database whose rules were saved before their names were
 * kept runs once, by hand, after the migration that makes their table. The content packages fill what they write
 * themselves, and every save since keeps its own. A row that has its bindings is left as it is: it runs again without
 * harm.
 *
 * Usage: bun --env-file=<file> scripts/db/fill-name-bindings.ts
 */

import { writeNameBindings } from "@/database/packages/nameBindings.ts";
import { db } from "@/server/database/index.ts";

console.log(`Done: ${await writeNameBindings(db, "all")} rows bound.`);
process.exit(0);
