/**
 * An existing character level's saved selections.
 */

import { buildLevelSelections, getSavedKlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
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

  const characterLevel = await CharacterLevels.findOne(db, { id: characterLevelId });
  if (!characterLevel || characterLevel.characterId !== characterId)
    throw new NotFoundError("Character level not found");

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ rulesetData }) => {
    // Inside withRulesetScope every Character* repo read below returns rows
    // with *Id fields already remapped to post-COW, and rulesetData's id
    // Maps auto-resolve stored pre-COW keys. No manual canonicalize calls.
    const [refreshedCharacterLevel, levelSkills, levelFeats, levelPowers] = await Promise.all([
      // Re-fetch the character level inside the context so its klassLevelId /
      // abilityId come back post-COW.
      CharacterLevels.findOne(db, { id: characterLevelId }),
      CharacterLevelSkills.findMany(db, { characterLevelIds: [characterLevelId] }),
      CharacterLevelFeats.findMany(db, { characterLevelIds: [characterLevelId] }),
      CharacterLevelPowers.findMany(db, { characterLevelIds: [characterLevelId] }),
    ]);
    if (!refreshedCharacterLevel) throw new NotFoundError("Character level not found");

    const { klassLevel, klass } = getSavedKlassLevel(rulesetData, refreshedCharacterLevel);
    return {
      characterLevelId: refreshedCharacterLevel.id,
      klassId: klass.id,
      klassName: klass.name,
      level: klassLevel.level,
      hd: klass.hd,
      hp: refreshedCharacterLevel.hp,
      abilityId: refreshedCharacterLevel.abilityId,
      ...buildLevelSelections(levelSkills, levelFeats, levelPowers, rulesetData),
    };
  });
}
