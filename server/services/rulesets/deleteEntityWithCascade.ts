import { type Db } from "@/server/database/index.ts";
import {
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  KlassSkills,
  PowersAptitudes,
} from "@/server/repositories/index.ts";

import { ENTITY_REPOS, type EntityType } from "./cow/index.ts";

// Hard-deletes an entity along with its junctions and customizations
// (and, for klasses, its klass_levels). Used by revertOverride and
// unsubscribeExtension.
export async function deleteEntityWithCascade(tx: Db, entityType: EntityType, entityId: string) {
  // A tombstone may already have no row. Still clean up any remaining children
  // when restoring it; creation cannot succeed against an absent owner.
  await ENTITY_REPOS[entityType].lockById(tx, entityId);

  // 1. Delete join tables
  if (entityType === "feats") {
    await FeatsAptitudes.delete(tx, { featId: entityId });
    await KlassLevelFeats.deleteByFeatId(tx, { featId: entityId });
  } else if (entityType === "powers") {
    await PowersAptitudes.delete(tx, { powerId: entityId });
    await KlassLevelPowers.deleteByPowerId(tx, { powerId: entityId });
  } else if (entityType === "aptitudes") {
    await KlassLevelFeats.deleteByAptitudeId(tx, { aptitudeId: entityId });
    await FeatsAptitudes.deleteByAptitudeId(tx, { aptitudeId: entityId });
    await PowersAptitudes.deleteByAptitudeId(tx, { aptitudeId: entityId });
    await KlassLevelPowers.deleteByAptitudeId(tx, { aptitudeId: entityId });
  } else if (entityType === "skills") {
    await KlassSkills.deleteBySkillId(tx, { skillId: entityId });
  } else if (entityType === "saves") {
    await KlassLevelSaves.deleteBySaveId(tx, { saveId: entityId });
  } else if (entityType === "klasses") {
    const levels = await KlassLevels.findManyByKlass(tx, { klassId: entityId });
    const levelIds = levels.map((l) => l.id);
    if (levelIds.length > 0) {
      for (const levelId of levelIds) {
        await KlassLevelFeats.deleteByKlassLevelId(tx, { klassLevelId: levelId });
        await KlassLevelPowers.deleteByKlassLevelId(tx, { klassLevelId: levelId });
        await KlassLevelSaves.deleteByKlassLevelId(tx, { klassLevelId: levelId });
      }
      for (const level of levels) {
        await KlassLevels.delete(tx, { id: level.id });
      }
    }
    await KlassSkills.deleteByKlassId(tx, { klassId: entityId });
  }
  // items.source_item_id is RESTRICT — callers that may hit references (revertOverride)
  // must repoint copies before invoking this.

  // 2. Delete the entity itself: the database deletes its customizations
  await ENTITY_REPOS[entityType].delete(tx, { id: entityId });
}
