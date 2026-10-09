/**
 * Powers and spells a level-up can pick for an aptitude pool: those its picker offers, but those picked already (in any
 * pool), as the feat picker leaves out a feat held.
 */

import { Engine, type LevelUpEngine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Powers } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A feat picked so far: the feat, and the pool it's picked in. */
type FeatPick = NonNullable<
  NonNullable<Parameters<LevelUpEngine["openPowerPicker"]>[0]["planned"]>["featPicks"]
>[number];

export async function getAvailablePowers(
  session: Session,
  characterId: string,
  aptitudeId: string,
  klassId: string,
  level: number,
  where: {
    pendingLevelFeatPicks?: FeatPick[];
    powerLevel?: number;
    search?: string;
    selectedFeatPicks?: FeatPick[];
    selectedPowerIds?: string[];
  },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
) {
  const { pendingLevelFeatPicks, powerLevel, search, selectedFeatPicks, selectedPowerIds } = where;
  return await withEditableCharacter(db, session, characterId, async (scope, character) => {
    const picker = Engine.for(scope)
      .character(character)
      .levelUp()
      .openPowerPicker({
        aptitudeId,
        editedLevelId: excludeCharacterLevelId,
        klassId,
        level,
        planned: {
          featPicks: [...(pendingLevelFeatPicks ?? []), ...(selectedFeatPicks ?? [])],
          klassLevelIds: pendingLevelKlassLevelIds,
        },
        powerLevel,
        selectedPowerIds,
      });
    const result = await Powers.findOptionPage(db, { ...picker.filters, search }, pagination);
    return { items: picker.describe(result.items), page: result.page, nextPage: result.nextPage };
  });
}
