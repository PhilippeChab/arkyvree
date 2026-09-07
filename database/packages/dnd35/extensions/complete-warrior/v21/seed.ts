import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";
import type { Db } from "@/server/database/index.ts";

// v20 shipped with the wrong rulesetName ("dnd35-complete-warrior" instead of
// the display name), so the backfill found no ruleset and silently inserted
// nothing. Re-run with the correct name. Idempotent.
export async function rerunCompleteWarriorBondedGrants(db: Db) {
  await backfillBondedGrants(db, {
    rulesetName: DND35_COMPLETE_WARRIOR_NAME,
    namePrefix: "Summon Familiar ",
    aptitudeSlug: "familiarbond",
    bondedKind: "familiar",
  });
  await backfillBondedGrants(db, {
    rulesetName: DND35_COMPLETE_WARRIOR_NAME,
    namePrefix: "Special Mount ",
    aptitudeSlug: "specialmountbond",
    bondedKind: "mount",
  });
}
