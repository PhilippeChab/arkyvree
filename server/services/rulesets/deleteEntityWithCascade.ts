import { ENTITY_REPOS } from "@/server/cow/index.ts";
import { type Db } from "@/server/database/index.ts";
import {
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  KlassSkills,
  PowersAptitudes,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

/**
 * Hard-deletes an entity along with its junctions and customizations (and, for klasses, its klass_levels). Used by
 * revertOverride and unsubscribeExtension.
 */
export async function deleteEntityWithCascade(tx: Db, entityType: RulesetEntityType, entityId: string) {
  // A tombstone may already have no row. Still clean up any remaining children
  // when restoring it; creation cannot succeed against an absent owner.
  await ENTITY_REPOS[entityType].lock(tx, { id: entityId });

  // 1. Delete join tables
  if (entityType === "feats") {
    await FeatsAptitudes.delete(tx, { featId: entityId });
    await KlassLevelFeats.delete(tx, { featId: entityId });
  } else if (entityType === "powers") {
    await PowersAptitudes.delete(tx, { powerId: entityId });
    await KlassLevelPowers.delete(tx, { powerId: entityId });
  } else if (entityType === "aptitudes") {
    await KlassLevelFeats.delete(tx, { aptitudeId: entityId });
    await FeatsAptitudes.delete(tx, { aptitudeId: entityId });
    await PowersAptitudes.delete(tx, { aptitudeId: entityId });
    await KlassLevelPowers.delete(tx, { aptitudeId: entityId });
  } else if (entityType === "skills") {
    await KlassSkills.delete(tx, { skillId: entityId });
  } else if (entityType === "saves") {
    await KlassLevelSaves.delete(tx, { saveId: entityId });
  } else if (entityType === "klasses") {
    const levels = await KlassLevels.findMany(tx, { klassId: entityId });
    const levelIds = levels.map((l) => l.id);
    if (levelIds.length > 0) {
      for (const levelId of levelIds) {
        await KlassLevelFeats.delete(tx, { klassLevelId: levelId });
        await KlassLevelPowers.delete(tx, { klassLevelId: levelId });
        await KlassLevelSaves.delete(tx, { klassLevelId: levelId });
      }
      for (const level of levels) await KlassLevels.delete(tx, { id: level.id });
    }
    await KlassSkills.delete(tx, { klassId: entityId });
  }
  // items.source_item_id is RESTRICT — callers that may hit references (revertOverride)
  // must repoint copies before invoking this.
  // 2. Delete the entity itself: the database deletes its customizations
  await ENTITY_REPOS[entityType].delete(tx, { id: entityId });
}
