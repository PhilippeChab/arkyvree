/**
 * Feats a level-up can pick: those available for an aptitude pool, flat or grouped by feat family.
 */

import { Engine, type LevelUpEngine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Feats } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A feat picked so far: the feat, and the pool it's picked in. */
type FeatPick = NonNullable<
  NonNullable<Parameters<LevelUpEngine["openFeatPicker"]>[0]["planned"]>["featPicks"]
>[number];

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
  const { family, pendingLevelFeatPicks, selectedFeatPicks } = where;
  return await withEditableCharacter(db, session, characterId, async (scope, character) => {
    const picker = Engine.for(scope)
      .character(character)
      .levelUp()
      .openFeatPicker({
        aptitudeId,
        editedLevelId: excludeCharacterLevelId,
        family,
        klassId,
        level,
        planned: {
          abilityIds: pendingLevelAbilityIds,
          featPicks: [...(pendingLevelFeatPicks ?? []), ...(selectedFeatPicks ?? [])],
          klassLevelIds: pendingLevelKlassLevelIds,
        },
      });
    const result = await Feats.findOptionPage(db, { ...picker.filters, search: where.search }, pagination);
    return { items: picker.describe(result.items), page: result.page, nextPage: result.nextPage };
  });
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
  const { pendingLevelFeatPicks, selectedFeatPicks } = where;
  return await withEditableCharacter(db, session, characterId, async (scope, character) => {
    const picker = Engine.for(scope)
      .character(character)
      .levelUp()
      .openFeatPicker({
        aptitudeId,
        editedLevelId: excludeCharacterLevelId,
        klassId,
        level,
        planned: {
          abilityIds: pendingLevelAbilityIds,
          featPicks: [...(pendingLevelFeatPicks ?? []), ...(selectedFeatPicks ?? [])],
          klassLevelIds: pendingLevelKlassLevelIds,
        },
      });
    const result = await Feats.findOptionGroupPage(db, { ...picker.groupFilters, search: where.search }, pagination);
    return { items: picker.describeGroups(result.items), page: result.page, nextPage: result.nextPage };
  });
}
