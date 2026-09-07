import { backfillBondedGrants } from "@/database/packages/dnd35/seed-utils/bonded-grants.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/database/packages/dnd35/names.ts";
import type { Db } from "@/server/database/index.ts";

/**
 * Complete Warrior owns two bonded grant feats that were added in this PR:
 *   - Summon Familiar (Hexblade) — bonded.familiar.level += max(0, level - 3)
 *   - Special Mount (Cavalier)   — bonded.mount.level += level
 *
 * Fresh installs land both modifiers via the regenerated v1 seed. Production
 * databases already past v1 need the backfill to add them.
 */
export async function backfillCompleteWarriorBondedGrants(db: Db) {
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
