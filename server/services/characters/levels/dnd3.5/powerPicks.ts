/**
 * Powers and spells a level-up can pick for an aptitude pool.
 */

import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Powers } from "@/server/repositories/index.ts";
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { getListPowerIds } from "@/server/services/rulesets/aptitudes/index.ts";
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
    excludeSchools?: string[];
    pendingLevelFeatPicks?: FeatPick[];
    powerLevel?: number;
    search?: string;
    selectedFeatPicks?: FeatPick[];
  },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const klassLevel = getKlassLevel(rulesetData, klassId, level);

    // Fetch auto-granted powers for the current klass level so they are part of the
    // projected character (for requirement checking) and excluded from selection.
    const autoGrantedPowerRecords = rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];

    const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
    const excludeIds = excludeCharacterLevelId
      ? getLevelIdsFromOnward(allCharacterLevels, excludeCharacterLevelId)
      : [];

    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds)
      : [];

    const allSelectedFeatPicks: FeatPick[] = [
      ...(where.pendingLevelFeatPicks ?? []),
      ...(where.selectedFeatPicks ?? []),
    ];

    const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevel.id);
    const selectedProjectedFeats = buildProjectedFeatsFromPicks(
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
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected: projectedData, scope });

    // The powers the character knows in this pool aren't offered again: when editing, the projection left out the
    // edited level and the levels after it
    const excludePowerIds = detailedCharacter.getKnownPowerIds(aptitudeId);

    // Also exclude auto-granted powers from the current klass level
    for (const rec of autoGrantedPowerRecords) excludePowerIds.push(rec.powersInRule.id);

    // Exclude powers virtually granted by modifiers (e.g. "set powers.<spell>.<apt>.known = true")
    const virtualPowerIds = detailedCharacter.getVirtuallyPossessedPowerIds();
    excludePowerIds.push(...virtualPowerIds);

    // Exclude powers from wizard-prohibited schools (delegated to ruleset-specific projector)
    const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter);
    const wizardExcluded = levelUpProjector.getExcludedPowerIds(aptitudeId, where.excludeSchools ?? [], rulesetData);
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
