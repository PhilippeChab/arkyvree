import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import { DND35_COMPLETE_ADVENTURER_NAME } from "@/database/packages/dnd35/names.ts";
import type { Db } from "@/server/database/index.ts";

// v5 shipped with the wrong rulesetName ("dnd35-complete-adventurer" instead
// of the display name), so the backfill found no ruleset and silently
// inserted nothing. Re-run with the correct name. Idempotent.
export async function rerunCompleteAdventurerBondedGrants(db: Db) {
  await backfillBondedGrants(db, {
    rulesetName: DND35_COMPLETE_ADVENTURER_NAME,
    namePrefix: "Animal Companion ",
    aptitudeSlug: "animalcompanionbond",
    bondedKind: "animalcompanion",
  });
}
