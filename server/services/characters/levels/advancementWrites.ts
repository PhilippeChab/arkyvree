import type { Db } from "@/drizzle/database.ts";
import type { AdvancementPlan, LevelEditPlan } from "@/engine/index.ts";
import { CharacterAdvancements, Picks } from "@/server/repositories/index.ts";

/**
 * Writes an advancement a plan makes after the character's last (`plan`: its track, and its picks under it, its value
 * step's among them: 3.5's hit points). Answers it as stored.
 */
export async function createAdvancement(tx: Db, characterId: string, plan: AdvancementPlan) {
  const [created] = await CharacterAdvancements.create(tx, { characterId, trackId: plan.trackId });
  await Picks.createMany(
    tx,
    plan.picks.map((pick) => ({ ...pick, advancementId: created.id })),
  );
  return created;
}

/** Writes a saved advancement's edit (`plan`): its picks in place of those it had, the advancement marked edited. */
export async function updateAdvancement(tx: Db, plan: Pick<LevelEditPlan, "advancement" | "picks">) {
  const advancementId = plan.advancement.id;
  await CharacterAdvancements.update(tx, { id: advancementId });
  await Picks.delete(tx, { advancementId });
  await Picks.createMany(
    tx,
    plan.picks.map((pick) => ({ ...pick, advancementId })),
  );
}
