/**
 * The level-up wizard's preview: the pools the planned levels merge, each level's skill points, and how the picks
 * spread over them.
 */

import { Engine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

export async function getLevelUpPreview(
  session: Session,
  characterId: string,
  levels: Array<{ klassId: string; level: number }>,
  abilityIds: (string | null)[],
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getPreview(levels, abilityIds),
  );
}
