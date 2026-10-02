import type { Db } from "@/server/database/index.ts";
import {
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
} from "@/server/repositories/index.ts";
import type { EntityType } from "@/server/services/rulesets/hashing.ts";

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
    case "feats":
      return CharacterLevelFeats.existsByFeatId(tx, { featId: entityId, rulesetId });
    case "powers":
      return CharacterLevelPowers.existsByPowerId(tx, { powerId: entityId, rulesetId });
    case "skills":
      return CharacterLevelSkills.existsBySkillId(tx, { skillId: entityId, rulesetId });
    case "races":
      return Characters.existsByRaceId(tx, { raceId: entityId, rulesetId });
    case "items":
      return CharacterInventory.existsByItemId(tx, { itemId: entityId, rulesetId });
    case "languages":
      return CharacterLanguages.existsByLanguageId(tx, { languageId: entityId, rulesetId });
    case "klasses":
      return CharacterLevels.existsByKlassId(tx, { klassId: entityId, rulesetId });
    case "klass_levels":
      return CharacterLevels.existsByKlassLevelId(tx, { klassLevelId: entityId, rulesetId });
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
