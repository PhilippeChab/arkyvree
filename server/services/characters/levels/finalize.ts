/**
 * A character's level saves: a level-up's levels saved (`finalizeLevelUp`), a saved level edited (`updateLevel`), and
 * its last level removed (`removeLevel`). Each reads the character's rows in its transaction, asks the engine what to
 * write, and writes it with what its bonded creatures become.
 */

import { getTableName } from "drizzle-orm";

import { levelsInCharacter } from "@/drizzle/schema.ts";
import { Engine, type LevelUpEngine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { type Db, withTransaction } from "@/server/database/index.ts";
import {
  Activities,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
} from "@/server/repositories/index.ts";
import { readBondedInputs, readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { writeBondedCreatures } from "./bondedWrites.ts";

/** A level's picks as the engine plans them: its skill ranks, and its feats and powers by pool. */
type LevelPicks = Pick<ReturnType<LevelUpEngine["planEdit"]>, "feats" | "powers" | "skills">;

/** Deletes a character level's skills, feats and powers. */
async function deleteLevelPicks(tx: Db, characterLevelId: string) {
  await CharacterLevelSkills.delete(tx, { characterLevelId });
  await CharacterLevelFeats.delete(tx, { characterLevelId });
  await CharacterLevelPowers.delete(tx, { characterLevelId });
}

/** Writes a character level's skills, feats and powers. */
async function insertLevelPicks(tx: Db, characterLevelId: string, { feats, powers, skills }: LevelPicks) {
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
async function lockEditableCharacter(tx: Db, session: Session, characterId: string) {
  const characterRecord = await getEditableCharacter(tx, session, characterId);
  await Characters.lock(tx, { id: characterRecord.id });
  return characterRecord;
}

/**
 * Saves a level-up's levels, the character's pooled picks (skills, feats, powers) spread over them, and what its bonded
 * creatures become: the engine checks each level, and the character with them unless `force`d, and the save writes
 * what it plans.
 */
export async function finalizeLevelUp(
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
    const characterRecord = await lockEditableCharacter(tx, session, characterId);

    return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(tx, characterRecord);
      const bonded = await readBondedInputs(tx, character);
      const plan = Engine.for(scope)
        .character(character)
        .levelUp()
        .plan(bonded, levels, { skills, feats, powers }, force);
      const createdLevels = [];
      for (const { feats: levelFeats, powers: levelPowers, skills: levelSkills, ...level } of plan.levels) {
        const [created] = await CharacterLevels.create(tx, { characterId, ...level });
        createdLevels.push(created);
        await insertLevelPicks(tx, created.id, { feats: levelFeats, powers: levelPowers, skills: levelSkills });
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

/** Removes the character's most recent level, with its picks, and what its bonded creatures become without it. */
export async function removeLevel(session: Session, characterId: string) {
  return await withTransaction(async (tx) => {
    const characterRecord = await lockEditableCharacter(tx, session, characterId);

    await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(tx, characterRecord);
      const bonded = await readBondedInputs(tx, character);
      const removal = Engine.for(scope).character(character).levelUp().planRemoval(bonded);
      await deleteLevelPicks(tx, removal.level.id);
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
export async function updateLevel(
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
    const characterRecord = await lockEditableCharacter(tx, session, characterId);

    return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(tx, characterRecord);
      const bonded = await readBondedInputs(tx, character);
      const edit = Engine.for(scope).character(character).levelUp().planEdit(bonded, characterLevelId, {
        abilityId,
        feats,
        force,
        hp,
        powers,
        skills,
      });

      await deleteLevelPicks(tx, characterLevelId);
      await CharacterLevels.update(tx, { hp: edit.hp, abilityId: edit.abilityId }, { id: characterLevelId });
      await insertLevelPicks(tx, characterLevelId, edit);
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
