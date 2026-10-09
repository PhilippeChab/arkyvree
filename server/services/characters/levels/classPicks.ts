/**
 * Classes the character can take next, with their eligibility.
 */

import { openClassPicker } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Klasses } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A feat the wizard's pending levels picked: the feat, and the pool it's picked in. */
type FeatPick = NonNullable<Parameters<typeof openClassPicker>[2]["featPicks"]>[number];

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
  return await withEditableCharacter(db, session, characterId, async (scope, character) => {
    const picker = openClassPicker(scope, character, {
      featPicks: pendingFeatPicks,
      levelAbilityIds: pendingLevelAbilityIds,
      levelKlassLevelIds: pendingLevelKlassLevelIds,
      skillAllocations: pendingSkillAllocations,
    });
    const klassPage = await Klasses.findPage(
      db,
      {
        rulesetId: character.record.rulesetId,
        ancestorRulesetIds: scope.rulesetData.cow.sourceChain,
        characterId,
        ...picker.filters,
        search: where.search,
      },
      pagination,
    );
    return { items: picker.describe(klassPage.items), page: klassPage.page, nextPage: klassPage.nextPage };
  });
}
