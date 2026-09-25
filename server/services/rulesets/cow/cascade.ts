import { getTableName } from "drizzle-orm";

import { modifiersInCustomization, propertiesInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import {
  Activities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevelSkills,
  CharacterLevels,
  Characters,
  Modifiers,
  Properties,
  Requirements,
} from "@/server/repositories/index.ts";
import type { EntityType } from "@/server/services/rulesets/hashing.ts";

// ──────────────────────────────────────────────────────────────
// Cascade helpers for modifier deletion
// ──────────────────────────────────────────────────────────────

export async function deleteModifiersWithCascade(
  tx: Db,
  where: { ids: string[] } | { sourceIds: string[]; sourceType: string },
) {
  const deleted = await Modifiers.deleteMany(tx, where);
  if (deleted.length > 0) {
    const modifierIds = deleted.map((m) => m.id);
    await deleteRequirementsWithCascade(tx, { entityIds: modifierIds, entityType: "modifiers" });
    await Activities.deleteByTargets(tx, { targetIds: modifierIds, targetTable: getTableName(modifiersInCustomization) });
  }
  return deleted;
}

export async function deletePropertiesWithCascade(
  tx: Db,
  where: { ids: string[] } | { entityIds: string[]; entityType: string },
) {
  const deleted = await Properties.deleteMany(tx, where);
  if (deleted.length > 0) {
    await Activities.deleteByTargets(tx, { targetIds: deleted.map((p) => p.id), targetTable: getTableName(propertiesInCustomization) });
  }
  return deleted;
}

export async function deleteRequirementsWithCascade(
  tx: Db,
  where: { ids: string[] } | { entityIds: string[]; entityType: string },
) {
  const deleted = await Requirements.deleteMany(tx, where);
  if (deleted.length > 0) {
    await Activities.deleteByTargets(tx, { targetIds: deleted.map((r) => r.id), targetTable: getTableName(requirementsInCustomization) });
  }
  return deleted;
}

/**
 * Returns true if any character on a ruleset that depends on `rulesetId` has
 * a pick that references this entity. The character-side `existsBy*` methods
 * join on `rulesets` and match three cases in one query: the same ruleset,
 * any descendant fork (`ancestor_ruleset_ids @> [rulesetId]`), or any host
 * that subscribes to it as an extension (`extension_ruleset_ids @> [rulesetId]`).
 *
 * Used as an inUse guard before any code path that would hard-delete an entity
 * — entity-delete services and revertOverride.
 * Saves / mechanics / abilities don't have a character-side pick path and
 * always return false. Accepts "klass_levels" alongside the EntityType union
 * so class-level removal paths can use the same helper.
 */
type CharacterPickTarget = EntityType | "klass_levels";

export async function entityHasCharacterPicks(
  tx: Db,
  entityType: CharacterPickTarget,
  entityId: string,
  rulesetId: string,
): Promise<boolean> {
  switch (entityType) {
    case "feats":     return CharacterLevelFeats.existsByFeatId(tx, { featId: entityId, rulesetId });
    case "powers":    return CharacterLevelPowers.existsByPowerId(tx, { powerId: entityId, rulesetId });
    case "skills":    return CharacterLevelSkills.existsBySkillId(tx, { skillId: entityId, rulesetId });
    case "races":     return Characters.existsByRaceId(tx, { raceId: entityId, rulesetId });
    case "items":     return CharacterInventory.existsByItemId(tx, { itemId: entityId, rulesetId });
    case "languages": return CharacterLanguages.existsByLanguageId(tx, { languageId: entityId, rulesetId });
    case "klasses":   return CharacterLevels.existsByKlassId(tx, { klassId: entityId, rulesetId });
    case "klass_levels": return CharacterLevels.existsByKlassLevelId(tx, { klassLevelId: entityId, rulesetId });
    case "aptitudes": {
      const [byFeat, byPower] = await Promise.all([
        CharacterLevelFeats.existsByAptitudeId(tx, { aptitudeId: entityId, rulesetId }),
        CharacterLevelPowers.existsByAptitudeId(tx, { aptitudeId: entityId, rulesetId }),
      ]);
      return byFeat || byPower;
    }
    case "saves":
    case "mechanics":
    case "abilities":
      return false;
  }
}
