import type { Db } from "@/server/database/index.ts";
import {
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

/**
 * Returns true if any character on a ruleset that depends on `rulesetId` has
 * a pick that references this entity by any of `ids`: its equivalents in the ruleset's view
 * (`CowData.getEquivalentIds`, since a pick stored before the entity was copied names its source), or the one row a
 * revert deletes. The character-side in-use `exists`
 * joins `rulesets` and match three cases in one query: the same ruleset,
 * any descendant fork (`ancestor_ruleset_ids @> [rulesetId]`), or any host
 * that subscribes to it as an extension (`extension_ruleset_ids @> [rulesetId]`).
 *
 * Used as an inUse guard before any code path that would hard-delete an entity
 * — entity-delete services and revertOverride.
 * Saves / mechanics / abilities don't have a character-side pick path and
 * always return false. Accepts "klass_levels" alongside the entity types
 * so class-level removal paths can use the same helper.
 */
type CharacterPickTarget = RulesetEntityType | "klass_levels";

export async function hasCharacterPicks(
  tx: Db,
  entityType: CharacterPickTarget,
  ids: string[],
  rulesetId: string,
): Promise<boolean> {
  switch (entityType) {
    case "feats":
      return CharacterLevelFeats.exists(tx, { featIds: ids, rulesetId });
    case "powers":
      return CharacterLevelPowers.exists(tx, { powerIds: ids, rulesetId });
    case "skills":
      return CharacterLevelSkills.exists(tx, { skillIds: ids, rulesetId });
    case "races":
      return Characters.exists(tx, { raceIds: ids, rulesetId });
    case "items":
      return CharacterInventory.exists(tx, { itemIds: ids, rulesetId });
    case "languages":
      return CharacterLanguages.exists(tx, { languageIds: ids, rulesetId });
    case "klasses":
      return CharacterLevels.exists(tx, { klassIds: ids, rulesetId });
    case "klass_levels":
      return CharacterLevels.exists(tx, { klassLevelIds: ids, rulesetId });
    case "aptitudes":
      return (
        (await CharacterLevelFeats.exists(tx, { aptitudeIds: ids, rulesetId })) ||
        (await CharacterLevelPowers.exists(tx, { aptitudeIds: ids, rulesetId }))
      );
    case "saves":
    case "mechanics":
    case "abilities":
      return false;
  }
}
