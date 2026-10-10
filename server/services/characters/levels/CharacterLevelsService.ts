/**
 * A character's levels: the level-up wizard's steps (`Steps`), pickers (`Pickers`) and preview, a saved level's
 * selections, and a level's save, edit and removal. Each reads the character's rows and asks the engine, which answers
 * by the character's ruleset; a save writes what the engine plans, with what the character's bonded creatures become.
 */

import { getTableName } from "drizzle-orm";

import { levelsInCharacter } from "@/drizzle/schema.ts";
import { Engine, type LevelPickRows } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import {
  Activities,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
} from "@/server/repositories/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { getEditableCharacter, withEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { writeBondedCreatures } from "./bondedWrites.ts";
import { Pickers } from "./concerns/Pickers.ts";
import { Steps } from "./concerns/Steps.ts";

class CharacterLevelsService extends include(Object, Pickers, Steps) {
  /** Deletes a character level's skills, feats and powers. */
  private async deleteLevelPicks(tx: Db, characterLevelId: string) {
    await CharacterLevelSkills.delete(tx, { characterLevelId });
    await CharacterLevelFeats.delete(tx, { characterLevelId });
    await CharacterLevelPowers.delete(tx, { characterLevelId });
  }

  /** Writes a character level's skills, feats and powers. */
  private async insertLevelPicks(tx: Db, characterLevelId: string, { feats, powers, skills }: LevelPickRows) {
    await CharacterLevelSkills.createMany(
      tx,
      skills.map((pick) => ({ characterLevelId, ...pick })),
    );
    await CharacterLevelFeats.createMany(
      tx,
      feats.map((pick) => ({ characterLevelId, ...pick })),
    );
    await CharacterLevelPowers.createMany(
      tx,
      powers.map((pick) => ({ characterLevelId, ...pick })),
    );
  }

  /**
   * The character the session may edit, locked until the transaction ends: its level flows run one at a time, so each
   * reads the levels the one before saved, and the level it adds goes after them (`CharacterLevels.create`).
   */
  private async lockEditableCharacter(tx: Db, session: Session, characterId: string) {
    const characterRecord = await getEditableCharacter(tx, session, characterId);
    await Characters.lock(tx, { id: characterRecord.id });
    return characterRecord;
  }

  /**
   * Saves a level-up's levels, the character's pooled picks (skills, feats, powers) spread over them, and what its
   * bonded creatures become: the engine checks each level, and the character with them unless `force`d, and the save
   * writes what it plans.
   */
  async finalizeLevelUp(
    session: Session,
    characterId: string,
    levels: Array<{
      abilityId: string | null;
      hp: number;
      klassId: string;
      level: number;
    }>,
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
    force: boolean = false,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await this.lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const bonded = await readBondedInputs(tx, character);
        const plan = Engine.for(scope)
          .character(character)
          .levelUp()
          .planLevels(bonded, levels, { skills, feats, powers }, force);
        const createdLevels = [];
        for (const { feats: levelFeats, powers: levelPowers, skills: levelSkills, ...level } of plan.levels) {
          const [created] = await CharacterLevels.create(tx, { characterId, ...level });
          createdLevels.push(created);
          await this.insertLevelPicks(tx, created.id, { feats: levelFeats, powers: levelPowers, skills: levelSkills });
        }
        await writeBondedCreatures(tx, characterRecord, plan.bonded);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(levelsInCharacter),
          type: "addLevel",
          data: { count: levels.length },
        });

        return createdLevels;
      });
    });
  }

  /** A saved level's selections, as its edit opens them: its class level, hit points, ability and picks. */
  async getLevel(session: Session, characterId: string, characterLevelId: string) {
    return await withEditableCharacter(db, session, characterId, (scope, character) =>
      Engine.for(scope).character(character).levelUp().describeLevel(characterLevelId),
    );
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`, each with its ability increase in
   * `abilityIds`): the pools they merge, each level's skill points, and how the picks spread over them.
   */
  async getPreview(
    session: Session,
    characterId: string,
    levels: Array<{ klassId: string; level: number }>,
    abilityIds: (string | null)[],
  ) {
    return await withEditableCharacter(db, session, characterId, (scope, character) =>
      Engine.for(scope).character(character).levelUp().describePreview(levels, abilityIds),
    );
  }

  /** Removes the character's most recent level, with its picks, and what its bonded creatures become without it. */
  async removeLevel(session: Session, characterId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await this.lockEditableCharacter(tx, session, characterId);

      await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const bonded = await readBondedInputs(tx, character);
        const removal = Engine.for(scope).character(character).levelUp().planRemoval(bonded);
        await this.deleteLevelPicks(tx, removal.level.id);
        await CharacterLevels.delete(tx, { id: removal.level.id });
        await writeBondedCreatures(tx, characterRecord, removal.bonded);
      });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(levelsInCharacter),
        type: "removeLevel",
      });

      return { success: true };
    });
  }

  /**
   * Re-saves a character level with new hit points, ability and picks: the engine checks them, and refuses the issues
   * the level answers for unless `force`d. Answers the level as it was saved before.
   */
  async updateLevel(
    session: Session,
    characterId: string,
    characterLevelId: string,
    hp: number,
    abilityId: string | null,
    skills: Record<string, number>,
    feats: Record<string, string[]>,
    powers: Record<string, string[]>,
    force: boolean = false,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await this.lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const bonded = await readBondedInputs(tx, character);
        const edit = Engine.for(scope)
          .character(character)
          .levelUp()
          .planEdit(bonded, characterLevelId, { abilityId, feats, hp, powers, skills }, force);

        await this.deleteLevelPicks(tx, characterLevelId);
        await CharacterLevels.update(tx, { hp: edit.hp, abilityId: edit.abilityId }, { id: characterLevelId });
        await this.insertLevelPicks(tx, characterLevelId, edit);
        await writeBondedCreatures(tx, characterRecord, edit.bonded);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(levelsInCharacter),
          type: "editLevel",
        });

        return edit.level;
      });
    });
  }
}

export default new CharacterLevelsService();
