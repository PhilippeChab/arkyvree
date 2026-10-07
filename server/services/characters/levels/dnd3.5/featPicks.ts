/**
 * Feats a level-up can pick: those available for an aptitude pool, flat or grouped by feat family.
 */

import type { RulesetData } from "@/engine/core/view/index.ts";
import {
  annotateFeatGroups,
  annotateFeatOptions,
  type Dnd35DetailedCharacter,
  type FeatPick,
  getFeatPickFilters,
  getKlassLevel,
  projectFeatPick,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Feats } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

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
    detailedCharacter: Dnd35DetailedCharacter,
    rulesetData: RulesetData,
    filters: ReturnType<typeof getFeatPickFilters>,
  ) => Promise<R>,
): Promise<R> {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const klassLevel = getKlassLevel(rulesetData, klassId, level);
    const levels = await CharacterLevels.findMany(db, { characterId });
    const projected = projectFeatPick(
      characterId,
      klassLevel.id,
      [...(picks.pendingLevelFeatPicks ?? []), ...(picks.selectedFeatPicks ?? [])],
      { excludeCharacterLevelId, levels, pendingLevelAbilityIds, pendingLevelKlassLevelIds },
      rulesetData,
    );
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected, scope });
    return await run(detailedCharacter, rulesetData, getFeatPickFilters(detailedCharacter, aptitudeId, rulesetData));
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
    async (detailedCharacter, rulesetData, filters) => {
      const result = await Feats.findOptionPage(
        db,
        { ...filters, family: where.family, search: where.search },
        pagination,
      );
      const items = annotateFeatOptions(detailedCharacter, result.items, rulesetData);
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
    async (detailedCharacter, rulesetData, filters) => {
      const result = await Feats.findOptionGroupPage(db, { ...filters, search: where.search }, pagination);
      const items = annotateFeatGroups(detailedCharacter, result.items, rulesetData);
      return { items, page: result.page, nextPage: result.nextPage };
    },
  );
}
