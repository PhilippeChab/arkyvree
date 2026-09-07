import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import { DND35_COMPLETE_ADVENTURER_NAME } from "@/database/packages/dnd35/names.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * Complete Adventurer owns one bonded grant feat:
 *   - Animal Companion (Beastmaster) — bonded.animalcompanion.level
 *       += max(0, level + 3)
 *
 * Fresh installs land the modifier via the regenerated v1 seed; production
 * databases already past v1 need the backfill.
 */
export async function backfillCompleteAdventurerBondedGrants(db: Db) {
  await backfillBondedGrants(db, {
    rulesetName: DND35_COMPLETE_ADVENTURER_NAME,
    namePrefix: "Animal Companion ",
    aptitudeSlug: "animalcompanionbond",
    bondedKind: "animalcompanion",
  });
}
