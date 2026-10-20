/** What a class level's edit writes on its row, whichever save edits it: its own form's, or its class's progression's. */

import type { Db } from "@/drizzle/database.ts";
import type { ClassEngine } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cow/index.ts";
import { KlassLevelFeats, KlassLevelSaves } from "@/server/repositories/index.ts";
import { writeEntityWrites } from "@/server/services/rulesets/entityWrites.ts";

/** A class level's edit, as the engine plans it. */
type LevelEditPlan = ReturnType<ClassEngine["planLevelEdit"]>;

/**
 * Writes a class level's edit (`plan`) on its row (`levelId`, the ruleset's own, a copy's once its class was copied):
 * what its form writes beside it (its fields' properties), and its granted feats and its saves when it gives them,
 * which replace the ones it had.
 */
export async function writeLevelEdit(tx: Db, scope: RulesetScope, levelId: string, plan: LevelEditPlan) {
  if (plan.writes) await writeEntityWrites(tx, scope, { entityId: levelId, entityType: "klass_levels" }, plan.writes);

  if (plan.feats !== undefined) {
    await KlassLevelFeats.delete(tx, { klassLevelId: levelId });
    await KlassLevelFeats.createMany(
      tx,
      plan.feats.map((feat) => ({ klassLevelId: levelId, ...feat })),
    );
  }

  if (plan.saves !== undefined) {
    await KlassLevelSaves.delete(tx, { klassLevelId: levelId });
    await KlassLevelSaves.createMany(
      tx,
      plan.saves.map((save) => ({ klassLevelId: levelId, ...save })),
    );
  }
}
