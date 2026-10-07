/**
 * Feats a level-up can pick: those available for an aptitude pool, flat or grouped by feat family.
 */

import type { RulesetData } from "@/engine/core/view/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Feats } from "@/server/repositories/index.ts";
import { RulesetFactory, type RulesetModuleOf } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A feat picked so far: the feat, and the pool it's picked in. */
type FeatPick = Parameters<LevelUp["projectFeatPick"]>[2][number];

type LevelUp = RulesetModuleOf["levelUp"];

/**
 * Runs a feat picker's query in the character's ruleset. `run` gets the character projected with the level's picks so
 * far (for each feat's eligibility) and the filters every picker shares (`getFeatPickFilters`).
 */
async function withFeatPicker<R>(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  picks: { pendingLevelFeatPicks?: FeatPick[]; selectedFeatPicks?: FeatPick[] },
  excludeCharacterLevelId: string | undefined,
  pendingLevelKlassLevelIds: string[] | undefined,
  pendingLevelAbilityIds: (string | undefined)[] | undefined,
  run: (
    levelUp: LevelUp,
    detailedCharacter: Parameters<LevelUp["annotateFeatOptions"]>[0],
    rulesetData: RulesetData,
    filters: ReturnType<LevelUp["getFeatPickFilters"]>,
  ) => Promise<R>,
): Promise<R> {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const { levelUp } = rulesetModule;
    const klassLevel = levelUp.getKlassLevel(rulesetData, klassId, level);
    const levels = await CharacterLevels.findMany(db, { characterId });
    const projected = levelUp.projectFeatPick(
      characterId,
      klassLevel.id,
      [...(picks.pendingLevelFeatPicks ?? []), ...(picks.selectedFeatPicks ?? [])],
      { excludeCharacterLevelId, levels, pendingLevelAbilityIds, pendingLevelKlassLevelIds },
      rulesetData,
    );
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected, scope });
    const filters = levelUp.getFeatPickFilters(detailedCharacter, aptitudeId, rulesetData);
    return await run(levelUp, detailedCharacter, rulesetData, filters);
  });
}

export async function getAvailableFeats(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { family?: string; pendingLevelFeatPicks?: FeatPick[]; search?: string; selectedFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  return await withFeatPicker(
    session,
    characterId,
    aptitudeId,
    klassId,
    level,
    where,
    excludeCharacterLevelId,
    pendingLevelKlassLevelIds,
    pendingLevelAbilityIds,
    async (levelUp, detailedCharacter, rulesetData, filters) => {
      const result = await Feats.findOptionPage(
        db,
        { ...filters, family: where.family, search: where.search },
        pagination,
      );
      const items = levelUp.annotateFeatOptions(detailedCharacter, result.items, rulesetData);
      return { items, page: result.page, nextPage: result.nextPage };
    },
  );
}

export async function getAvailableFeatsGrouped(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: { pendingLevelFeatPicks?: FeatPick[]; search?: string; selectedFeatPicks?: FeatPick[] },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  return await withFeatPicker(
    session,
    characterId,
    aptitudeId,
    klassId,
    level,
    where,
    excludeCharacterLevelId,
    pendingLevelKlassLevelIds,
    pendingLevelAbilityIds,
    async (levelUp, detailedCharacter, rulesetData, filters) => {
      const result = await Feats.findOptionGroupPage(db, { ...filters, search: where.search }, pagination);
      const items = levelUp.annotateFeatGroups(detailedCharacter, result.items, rulesetData);
      return { items, page: result.page, nextPage: result.nextPage };
    },
  );
}
