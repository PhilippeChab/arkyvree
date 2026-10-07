/**
 * Classes the character can take next, with their eligibility.
 */

import { openClassPicker } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { CharacterLevels, Klasses } from "@/server/repositories/index.ts";
import { readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A feat the wizard's pending levels picked: the feat, and the pool it's picked in. */
type FeatPick = NonNullable<Parameters<ReturnType<typeof openClassPicker>["describe"]>[2]["featPicks"]>[number];

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
    const klassPage = await Klasses.findPage(
      db,
      {
        rulesetId: characterRecord.rulesetId,
        ancestorRulesetIds: scope.rulesetData.cow.sourceChain,
        characterId,
        kind: "pc",
        search: where.search,
      },
      pagination,
    );
    if (klassPage.items.length === 0) return { items: [], page: klassPage.page, nextPage: klassPage.nextPage };

    const characterKlassLevels = await CharacterLevels.findMaxKlassLevels(db, { characterId });
    const picker = openClassPicker(
      scope,
      klassPage.items,
      new Map(characterKlassLevels.map((i) => [i.klassId, i.maxLevel])),
    );
    // Only a class with requirements needs the character, built with the wizard's pending picks
    const character = picker.needsCharacter ? await readCharacterInput(db, characterRecord) : undefined;
    const items = picker.describe(characterId, character, {
      featPicks: pendingFeatPicks,
      levelAbilityIds: pendingLevelAbilityIds,
      levelKlassLevelIds: pendingLevelKlassLevelIds,
      skillAllocations: pendingSkillAllocations,
    });
    return { items, page: klassPage.page, nextPage: klassPage.nextPage };
  });
}
