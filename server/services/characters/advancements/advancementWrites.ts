import type { Db } from "@/drizzle/database.ts";
import type { AdvancementEditPlan, AdvancementWrite } from "@/engine/index.ts";
import { CharacterAdvancements, Picks } from "@/server/repositories/index.ts";
import type { Ruleset } from "@/shared/relations.ts";

/**
 * Writes an advancement a plan makes after the character's last (`plan`: its entry, and its picks under it, its value
 * step's among them: 3.5's hit points), its picks of its ruleset's (`ruleset`) base rules' steps. Answers it as stored.
 */
export async function createAdvancement(
  tx: Db,
  ruleset: Pick<Ruleset, "baseRules">,
  characterId: string,
  plan: AdvancementWrite,
) {
  const [created] = await CharacterAdvancements.create(tx, { characterId, entryId: plan.entryId });
  await Picks.createMany(
    tx,
    ruleset.baseRules,
    plan.picks.map((pick) => ({ ...pick, advancementId: created.id })),
  );
  return created;
}

/**
 * Writes a saved advancement's edit (`plan`): its picks (of its ruleset's base rules' steps, `ruleset`'s) in place of
 * those it had, the advancement marked edited.
 */
export async function updateAdvancement(
  tx: Db,
  ruleset: Pick<Ruleset, "baseRules">,
  plan: Pick<AdvancementEditPlan, "advancement" | "picks">,
) {
  const advancementId = plan.advancement.id;
  await CharacterAdvancements.update(tx, { id: advancementId });
  await Picks.delete(tx, { advancementId });
  await Picks.createMany(
    tx,
    ruleset.baseRules,
    plan.picks.map((pick) => ({ ...pick, advancementId })),
  );
}
