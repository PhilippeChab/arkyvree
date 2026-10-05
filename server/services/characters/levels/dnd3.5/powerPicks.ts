/**
 * Powers and spells a level-up can pick for an aptitude pool.
 */

import { db } from "@/server/database/index.ts";
import { CharacterLevels, Powers } from "@/server/repositories/index.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { getListPowerIds } from "@/server/services/rulesets/aptitudes/index.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Session } from "@/shared/relations.ts";

import { getKlassLevel } from "./classes.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedFeatsFromPicks,
  type FeatPick,
  getLevelIdsFromOnward,
} from "./projection.ts";
import { annotateRequirements } from "./validation.ts";

export async function getAvailablePowers(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: {
    powerLevel?: number;
    search?: string;
    excludeSchools?: string[];
    selectedFeatPicks?: FeatPick[];
    pendingLevelFeatPicks?: FeatPick[];
  },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const klassLevel = getKlassLevel(rulesetData, klassId, level);

    // Fetch auto-granted powers for the current klass level so they are part of the
    // projected character (for requirement checking) and excluded from selection.
    const autoGrantedPowerRecords = rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];

    const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
    const excludeIds = excludeCharacterLevelId
      ? getLevelIdsFromOnward(allCharacterLevels, excludeCharacterLevelId)
      : [];
    const excludeIdSet = new Set(excludeIds);

    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds)
      : [];

    const allSelectedFeatPicks: FeatPick[] = [
      ...(where.pendingLevelFeatPicks ?? []),
      ...(where.selectedFeatPicks ?? []),
    ];

    const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevel.id);
    const { projectedFeats: selectedProjectedFeats } = buildProjectedFeatsFromPicks(
      allSelectedFeatPicks,
      klassLevel.id,
      projectedCharacterLevel.id,
      rulesetData,
    );
    const projectedData: Dnd35ProjectedCharacterData = {
      ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
      characterLevels: [...pendingLevels, projectedCharacterLevel],
      ...(selectedProjectedFeats.length > 0 && { feats: selectedProjectedFeats }),
      powers: autoGrantedPowerRecords.map((rec) => ({
        ...rec.powersInRule,
        klassLevelId: klassLevel.id,
        characterLevelId: projectedCharacterLevel.id,
        aptitudeId: rec.aptitudeId,
        powerLevel: null,
        saveName: null,
      })),
    };

    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);

    // Get character's existing powers to exclude already-taken ones
    // When editing, exclude the edited level and all subsequent levels from the "already taken" set
    const characterLevels =
      excludeIdSet.size > 0 ? allCharacterLevels.filter((l) => !excludeIdSet.has(l.id)) : allCharacterLevels;
    const characterLevelIds = characterLevels.map((lvl) => lvl.id);
    const pickedPowers = await Powers.findPicks(db, { characterLevelIds });
    const givenPowers = await Powers.findGrants(db, { levels: characterLevels });
    const excludePowerIds = [...pickedPowers, ...givenPowers]
      .filter((power) => power.aptitudeId === aptitudeId)
      .map((power) => power.id);

    // Also exclude auto-granted powers from the current klass level
    for (const rec of autoGrantedPowerRecords) {
      excludePowerIds.push(rec.powersInRule.id);
    }

    // Exclude powers virtually granted by modifiers (e.g. "set powers.<spell>.<apt>.known = true")
    const virtualPowerIds = detailedCharacter.getVirtuallyPossessedPowerIds();
    excludePowerIds.push(...virtualPowerIds);

    // Exclude powers from wizard-prohibited schools (delegated to ruleset-specific projector)
    const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;
    const wizardExcluded = await levelUpProjector.getExcludedPowerIds(
      db,
      aptitudeId,
      characterLevels,
      selectedProjectedFeats.flatMap((f) => f.properties),
      where.excludeSchools ?? [],
      rulesetData,
    );
    excludePowerIds.push(...wizardExcluded);

    const result = await Powers.findOptionPage(
      db,
      {
        ids: getListPowerIds(rulesetData, { aptitudeId, level: where.powerLevel }),
        excludePowerIds,
        search: where.search,
      },
      pagination,
    );

    const items = annotateRequirements(detailedCharacter, result.items, rulesetData);
    return { items, page: result.page, nextPage: result.nextPage };
  });
}
