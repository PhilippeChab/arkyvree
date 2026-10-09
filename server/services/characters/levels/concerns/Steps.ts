import { Engine } from "@/engine/index.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { db } from "@/server/database/index.ts";
import { withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * The level-up wizard's steps, for a new level after those it plans (`plannedClassLevelIds`) or a saved level's edit
 * (`editedLevelId`): the ability increase, the feat and power pools, and the skill points.
 */
export function Steps<B extends Constructor>(Base: B) {
  abstract class WithSteps extends Base {
    /**
     * The ability step: the character's abilities, when the level it adds (after `plannedLevelCount` planned ones) or
     * edits takes an ability increase.
     */
    async getAbilityStep(session: Session, characterId: string, editedLevelId?: string, plannedLevelCount?: number) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope).character(character).levelUp().describeAbilityStep(editedLevelId, plannedLevelCount),
      );
    }

    /** The feat step of class `classId`'s `level`: the pools the character picks feats in with it, and its grants. */
    async getFeatStep(
      session: Session,
      characterId: string,
      classId: string,
      level: number,
      editedLevelId?: string,
      plannedClassLevelIds?: string[],
    ) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope)
          .character(character)
          .levelUp()
          .describeFeatStep(classId, level, { editedLevelId, planned: { klassLevelIds: plannedClassLevelIds } }),
      );
    }

    /** The power step of class `classId`'s `level`: the pools the character picks powers in with it, and its grants. */
    async getPowerStep(
      session: Session,
      characterId: string,
      classId: string,
      level: number,
      editedLevelId?: string,
      plannedClassLevelIds?: string[],
    ) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope)
          .character(character)
          .levelUp()
          .describePowerStep(classId, level, { editedLevelId, planned: { klassLevelIds: plannedClassLevelIds } }),
      );
    }

    /** The skill step of class `classId`'s `level`, with its ability increase: the points to spend, each skill's status. */
    async getSkillStep(
      session: Session,
      characterId: string,
      classId: string,
      level: number,
      abilityId?: string,
      editedLevelId?: string,
      plannedClassLevelIds?: string[],
      plannedAbilityIds?: (string | undefined)[],
    ) {
      return await withEditableCharacter(db, session, characterId, (scope, character) =>
        Engine.for(scope)
          .character(character)
          .levelUp()
          .describeSkillStep(classId, level, {
            abilityId,
            editedLevelId,
            planned: { abilityIds: plannedAbilityIds, klassLevelIds: plannedClassLevelIds },
          }),
      );
    }
  }
  return WithSteps;
}
