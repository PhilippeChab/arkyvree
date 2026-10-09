/**
 * The level-up wizard's steps, as the engine answers them for the character: its ability increase (`getAttributeSlots`),
 * its skill points (`getSkillSlots`), and its feat and power pools, for a new level or an edited one.
 */

import { Engine } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

export async function getAttributeSlots(
  session: Session,
  characterId: string,
  excludeCharacterLevelId?: string,
  pendingLevelCount?: number,
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getAttributeSlots(excludeCharacterLevelId, pendingLevelCount),
  );
}

export async function getEditFeatSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  characterLevelId: string,
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getFeatSlots(klassId, level, { editedLevelId: characterLevelId }),
  );
}

export async function getEditPowerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  characterLevelId: string,
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getPowerSlots(klassId, level, { editedLevelId: characterLevelId }),
  );
}

export async function getFeatSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  pendingLevelKlassLevelIds?: string[],
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getFeatSlots(klassId, level, { pendingLevelKlassLevelIds }),
  );
}

export async function getPowerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  pendingLevelKlassLevelIds?: string[],
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getPowerSlots(klassId, level, { pendingLevelKlassLevelIds }),
  );
}

export async function getSkillSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  excludeCharacterLevelId?: string,
  abilityId?: string,
  pendingLevelKlassLevelIds?: string[],
  pendingLevelAbilityIds?: (string | undefined)[],
) {
  return await withEditableCharacter(db, session, characterId, (scope, character) =>
    Engine.for(scope).character(character).levelUp().getSkillSlots(klassId, level, {
      editedLevelId: excludeCharacterLevelId,
      abilityId,
      pendingLevelKlassLevelIds,
      pendingLevelAbilityIds,
    }),
  );
}
