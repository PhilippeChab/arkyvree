/**
 * Moves the text of the rules saved while a name's key left its accented Latin letters out to the keys that read them
 * as plain letters (`skills.discrtion.misc` → `skills.discretion.misc`, `updateNameKeys`), in every ruleset of the
 * database DATABASE_URL names: its entities' modifiers and requirements, and the modifiers set on its characters. The
 * one step a database whose rules were saved before then runs once, by hand, after the deploy that reads accented
 * letters plain; until then, a rule bound to what its names mean reads its old text as the new
 * (`NameBindingReader.isStale`). A row whose text holds no old key is left as it is: a second run changes nothing. It
 * prints what it rewrote, and lists what it leaves for a person to settle: the old keys several names had, those whose
 * new key several names share, and the names the new keys read as one ("Côte" and "Cote"), one of which a rename
 * tells apart.
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
for (const { field, held, keys, names, rowId, rulesetId } of update.unsettled) {
  const meaning = names ? `would be "${keys[0]}", which names ${names.join(" and ")}` : `could be ${keys.join(" or ")}`;
  console.log(`Left: ruleset ${rulesetId}, row ${rowId}, ${field} "${held}" ${meaning}`);
}
for (const { entityType, key, names, rulesetId } of update.clashes)
  console.log(`Read as one: ruleset ${rulesetId}, ${entityType} ${names.join(" and ")} (${key}): rename one`);
if (update.failed.length > 0) console.log(`Failed, rolled back: rulesets ${update.failed.join(", ")}`);
process.exit(update.failed.length > 0 ? 1 : 0);
