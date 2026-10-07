/**
 * Powers and spells a level-up can pick for an aptitude pool.
 */

import {
  annotateRequirements,
  type FeatPick,
  getKlassLevel,
  getPowerPickFilters,
  projectPowerPick,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Powers } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

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
    const levels = await CharacterLevels.findMany(db, { characterId });
    const projected = projectPowerPick(
      characterId,
      klassLevel.id,
      [...(where.pendingLevelFeatPicks ?? []), ...(where.selectedFeatPicks ?? [])],
      { excludeCharacterLevelId, levels, pendingLevelKlassLevelIds },
      rulesetData,
    );
    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected, scope });

    const result = await Powers.findOptionPage(
      db,
      {
        ...getPowerPickFilters(detailedCharacter, aptitudeId, klassLevel.id, where, rulesetData),
        search: where.search,
      },
      pagination,
    );
    const items = annotateRequirements(detailedCharacter, result.items, rulesetData);
    return { items, page: result.page, nextPage: result.nextPage };
  });
}
