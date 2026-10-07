/**
 * Classes the character can take next, with their eligibility.
 */

import {
  buildClassOptions,
  type Dnd35DetailedCharacter,
  type FeatPick,
  getClassPick,
  projectPendingPicks,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Klasses } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

export async function getAvailableKlasses(
  session: Session,
  characterId: string,
  where: { search?: string },
  pagination: { limit: number; page: number },
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
  pendingFeatPicks?: FeatPick[],
  pendingSkillAllocations?: { rank: number; skillId: string }[],
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    const { ruleset, rulesetData } = scope;
    const { sourceChain } = rulesetData.cow;

    const klassPage = await Klasses.findPage(
      db,
      {
        rulesetId: characterRecord.rulesetId,
        ancestorRulesetIds: sourceChain,
        characterId,
        kind: "pc",
        search: where.search,
      },
      pagination,
    );
    if (klassPage.items.length === 0) return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };

    const characterKlassLevels = await CharacterLevels.findMaxKlassLevels(db, { characterId });
    const pick = getClassPick(
      klassPage.items,
      new Map(characterKlassLevels.map((i) => [i.klassId, i.maxLevel])),
      rulesetData,
    );
    if (pick.candidates.length === 0) return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };

    // Only a class with requirements needs the character, built with the wizard's pending picks
    let detailedCharacter: Dnd35DetailedCharacter | undefined;
    if (pick.requirementsByKlassLevel.size > 0) {
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const projected = projectPendingPicks(
        characterId,
        rulesetData,
        pendingLevelKlassLevelIds,
        pendingLevelAbilityIds,
        pendingFeatPicks,
        pendingSkillAllocations,
      );
      detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { projected, scope });
    }

    const items = buildClassOptions(pick, detailedCharacter, characterId, rulesetData);
    return { items, page: klassPage.page, nextPage: klassPage.nextPage };
  });
}
