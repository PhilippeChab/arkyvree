/**
 * Moves the text of the rules saved before a name's key kept its accented Latin letters to the keys that keep them
 * (`skills.discrtion.misc` → `skills.discrétion.misc`, `updateNameKeys`), in every ruleset of the database DATABASE_URL
 * names: its entities' modifiers and requirements, and the modifiers set on its characters. The one step a database
 * whose rules were saved before then runs once, by hand, after the deploy that keeps accented letters; until then, a
 * rule bound to what its names mean reads its old text as the new (`NameBindingReader.isStale`). A row whose text holds
 * no old key is left as it is: a second run changes nothing. It prints what it rewrote, and lists the old keys several
 * names now have keys for, which it leaves for a person to settle.
 *
 * Usage: bun --env-file=<file> scripts/db/rekey-names.ts
 */

import { updateNameKeys } from "@/database/packages/nameBindings.ts";
import { db } from "@/server/database/index.ts";

const update = await updateNameKeys(db);
console.log(
  `Done: ${update.rewritten} rows rewritten in ${update.rulesets} rulesets, ${update.groups} group bindings renamed.`,
);
if (update.changedMeanwhile > 0) console.log(`${update.changedMeanwhile} rows changed while read: run it again.`);
for (const { field, held, keys, rowId, rulesetId } of update.unsettled)
  console.log(`Left: ruleset ${rulesetId}, row ${rowId}, ${field} "${held}" could be ${keys.join(" or ")}`);
if (update.failed.length > 0) console.log(`Failed, rolled back: rulesets ${update.failed.join(", ")}`);
process.exit(update.failed.length > 0 ? 1 : 0);
