/**
 * Powers and spells a level-up can pick for an aptitude pool: those its picker offers, but those picked already (in any
 * pool), as the feat picker leaves out a feat held.
 */

import { openPowerPicker } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { Powers } from "@/server/repositories/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/** A feat picked so far: the feat, and the pool it's picked in. */
type FeatPick = NonNullable<Parameters<typeof openPowerPicker>[2]["selectedFeatPicks"]>[number];

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
    selectedPowerIds?: string[];
  },
  pagination: { limit: number; page: number },
  excludeCharacterLevelId?: string,
  pendingLevelKlassLevelIds?: string[],
) {
  const { selectedPowerIds = [], ...pick } = where;
  return await withEditableCharacter(db, session, characterId, async (scope, character) => {
    const picker = openPowerPicker(scope, character, {
      ...pick,
      aptitudeId,
      excludeCharacterLevelId,
      klassId,
      level,
      pendingLevelKlassLevelIds,
    });
    const excludePowerIds = [...picker.filters.excludePowerIds, ...selectedPowerIds];
    const result = await Powers.findOptionPage(
      db,
      { ...picker.filters, excludePowerIds, search: pick.search },
      pagination,
    );
    return { items: picker.annotate(result.items), page: result.page, nextPage: result.nextPage };
  });
}
