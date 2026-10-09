/**
 * An existing character level's saved selections.
 */

import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

export async function getLevel(session: Session, characterId: string, characterLevelId: string) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
    // Read in the scope, the level's and its picks' references are the view's
    const level = await CharacterLevels.findOne(db, { id: characterLevelId });
    if (!level || level.characterId !== characterId) throw new NotFoundError("Character level not found");
    const characterLevelIds = [characterLevelId];
    return Engine.for(scope)
      .characters()
      .describeLevel(level, {
        skills: await CharacterLevelSkills.findMany(db, { characterLevelIds }),
        feats: await CharacterLevelFeats.findMany(db, { characterLevelIds }),
        powers: await CharacterLevelPowers.findMany(db, { characterLevelIds }),
      });
  });
}
