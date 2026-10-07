/**
 * All level mutation operations.
 *
 * - updateLevel — re-saves an existing level with new selections
 * - removeLevel — deletes the most recent level
 * - finalizeLevelUp — commits one or more levels, distributing pooled selections across them
 */

import { getTableName } from "drizzle-orm";

import { levelsInCharacter } from "@/drizzle/schema.ts";
import { type RulesetData } from "@/engine/core/view/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { type Db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
} from "@/server/repositories/index.ts";
import { RulesetFactory, type RulesetModuleOf } from "@/server/rulesets/RulesetFactory.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { reconcileAllBondedKinds } from "./bondedReconcile.ts";
import { buildPlannedLevels } from "./plannedLevels.ts";
import { validateAndFetchLevelSelections } from "./validation.ts";

/** Deletes a character level's skills, feats and powers. */
async function deleteLevelChildren(tx: Db, characterLevelId: string) {
  await CharacterLevelSkills.delete(tx, { characterLevelId });
  await CharacterLevelFeats.delete(tx, { characterLevelId });
  await CharacterLevelPowers.delete(tx, { characterLevelId });
}

/** Inserts skill, feat, and power child records for a character level. */
async function insertLevelChildren(
  tx: Db,
  characterLevelId: string,
  skills: Record<string, number>,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
) {
  const skillRows = Object.entries(skills)
    .filter(([, rank]) => rank > 0)
    .map(([skillId, rank]) => ({ characterLevelId, skillId, rank }));
  const featRows = Object.entries(feats).flatMap(([aptitudeId, ids]) =>
    ids.map((featId) => ({ characterLevelId, featId, aptitudeId })),
  );
  const powerRows = Object.entries(powers).flatMap(([aptitudeId, ids]) =>
    ids.map((powerId) => ({ characterLevelId, powerId, aptitudeId })),
  );

  await CharacterLevelSkills.createMany(tx, skillRows);
  await CharacterLevelFeats.createMany(tx, featRows);
  await CharacterLevelPowers.createMany(tx, powerRows);
}

/**
 * Phase 2: validates and inserts each planned level with its share of the selections, in order, so each one sees the
 * levels before it.
 */
async function insertPlannedLevels(
  tx: Db,
  rulesetModule: RulesetModuleOf,
  rulesetData: RulesetData,
  characterId: string,
  levels: { abilityId: string | null; hp: number }[],
  klassLevelEntries: ReturnType<RulesetModuleOf["levelUp"]["getPlannedKlassLevels"]>,
  distributedLevels: ReturnType<RulesetModuleOf["levelUp"]["distributePlannedPicks"]>,
  baseExistingLevels: Awaited<ReturnType<typeof CharacterLevels.findMany>>,
) {
  const createdLevels: Awaited<ReturnType<typeof CharacterLevels.create>>[number][] = [];

  for (let i = 0; i < levels.length; i++) {
    const { hp, abilityId } = levels[i];
    const { klass, klassLevel } = klassLevelEntries[i];
    const { skills: levelSkills, feats: levelFeats, powers: levelPowers } = distributedLevels[i];

    // Reject re-finalizing an already-existing level
    const existingLevel = await CharacterLevels.findOne(tx, {
      characterId,
      klassLevelId: klassLevel.id,
    });
    if (existingLevel) throw new BadRequestError(`Level ${i + 1}: This level has already been finalized`);

    // Validate ability increase timing using base count + plan offset
    const totalLevelCount = baseExistingLevels.length + i;
    rulesetModule.levelUp.checkAbilityIncrease(totalLevelCount, abilityId, `Level ${i + 1}: `);

    // baseExistingLevels (from before the loop) + levels we've inserted so
    // far in this iteration covers what a fresh findMany would return,
    // without the per-iteration round-trip.
    const existingLevels = [...baseExistingLevels, ...createdLevels];

    await validateAndFetchLevelSelections(tx, rulesetModule, {
      klass,
      klassLevel,
      otherLevels: existingLevels,
      hp,
      abilityId,
      skills: levelSkills,
      feats: levelFeats,
      powers: levelPowers,
      rulesetData,
    });
    // Insert records — subsequent iterations will see these via read-your-writes
    const rows = await CharacterLevels.create(tx, {
      characterId,
      klassLevelId: klassLevel.id,
      hp,
      abilityId: abilityId || null,
    });
    const characterLevel = rows[0];
    createdLevels.push(characterLevel);

    await insertLevelChildren(tx, characterLevel.id, levelSkills, levelFeats, levelPowers);
  }
  return createdLevels;
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

/** Commits one or more levels at once. Distributes pooled selections (skills, feats, powers) across levels, then validates and inserts each sequentially within a single transaction. */
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
      const { ruleset, rulesetData } = scope;
      const { sourceChain } = rulesetData.cow;
      const rulesetIds = new Set([characterRecord.rulesetId, ...sourceChain]);

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);

      // Phase 1: Compute per-level distribution from pool selections
      // Resolve all klasses/klassLevels upfront — all reads from the composed
      // cache (no DB round trips inside the loop).
      const klassLevelEntries = rulesetModule.levelUp.getPlannedKlassLevels(rulesetData, levels, rulesetIds);

      // Early ruleset-lineage check for submitted entity IDs. Per-level
      // validateAndFetchLevelSelections re-checks these, but it runs *after*
      // the Phase 1 character build below, which assumes all referenced
      // entities resolve in the ruleset's composed cache. Throwing up-front
      // keeps the user-facing error targeted (BadRequestError) instead of a
      // downstream TypeError from the aptitude builder.
      rulesetModule.levelUp.checkSelections(rulesetData, skills, feats, powers);

      const baseExistingLevels = await CharacterLevels.findMany(tx, {
        characterId,
      });

      const planned = await buildPlannedLevels(
        tx,
        rulesetModule,
        characterRecord,
        scope,
        klassLevelEntries,
        baseExistingLevels.length,
      );
      const distributedLevels = rulesetModule.levelUp.distributePlannedPicks(
        planned,
        skills,
        feats,
        powers,
        rulesetData,
      );

      // Phase 2: Per-level validation and insertion
      const createdLevels = await insertPlannedLevels(
        tx,
        rulesetModule,
        rulesetData,
        characterId,
        levels,
        klassLevelEntries,
        distributedLevels,
        baseExistingLevels,
      );

      const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, { database: tx, scope });

      if (!force) rulesetModule.levelUp.checkIssues(detailedCharacter.validate().issues);

      await reconcileAllBondedKinds(tx, rulesetModule, characterRecord, detailedCharacter, rulesetData);

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

/** Removes the most recent character level and all its children (skills, feats, powers). */
export async function removeLevel(session: Session, characterId: string) {
  return await withTransaction(async (tx) => {
    const characterRecord = await lockEditableCharacter(tx, session, characterId);

    const lastLevel = await CharacterLevels.findLatest(tx, {
      characterId,
    });
    if (!lastLevel) throw new NotFoundError("No level to remove.");

    await deleteLevelChildren(tx, lastLevel.id);
    await CharacterLevels.delete(tx, { id: lastLevel.id });

    await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
      const rulesetModule = RulesetFactory.fromBaseRules(scope.ruleset.baseRules);
      const reconcileCharacter = await buildCharacter(rulesetModule, characterRecord, { database: tx, scope });
      await reconcileAllBondedKinds(tx, rulesetModule, characterRecord, reconcileCharacter, scope.rulesetData);
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

/** Re-saves an existing character level with new selections (HP, ability, skills, feats, powers). Validates all picks and rebuilds the character to check constraints. */
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
      const { ruleset, rulesetData } = scope;
      const characterLevel = await CharacterLevels.findOne(tx, {
        id: characterLevelId,
      });
      if (!characterLevel || characterLevel.characterId !== characterId)
        throw new NotFoundError("Character level not found");

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const { klassLevel, klass } = rulesetModule.levelUp.getSavedKlassLevel(rulesetData, characterLevel);
      // The levels in the order the character took them: the edited level's index is its total level less one
      const existingLevels = await CharacterLevels.findMany(tx, { characterId });
      const levelIndex = existingLevels.findIndex((l) => l.id === characterLevelId);
      rulesetModule.levelUp.checkAbilityIncrease(levelIndex, abilityId);
      const validationResult = await validateAndFetchLevelSelections(tx, rulesetModule, {
        klass,
        klassLevel,
        otherLevels: existingLevels.filter((l) => l.id !== characterLevelId),
        hp,
        abilityId,
        skills,
        feats,
        powers,
        rulesetData,
      });

      const builds = { database: tx, scope };
      const detailedCharacter = await buildCharacter(rulesetModule, characterRecord, {
        ...builds,
        projected: rulesetModule.levelUp.projectEditedLevel(
          characterId,
          characterLevel,
          klassLevel.id,
          hp,
          abilityId,
          skills,
          validationResult,
        ),
      });
      const { valid, issues } = detailedCharacter.validate();
      if (!valid && !force) {
        // The issues of the pools the level adds to: built without the level and every later one, then with it alone
        const { before, withLevel } = rulesetModule.levelUp.projectLevelContribution(
          characterId,
          existingLevels,
          characterLevelId,
          klassLevel.id,
          skills,
          validationResult,
        );
        rulesetModule.levelUp.checkEditedLevelIssues(
          issues,
          await buildCharacter(rulesetModule, characterRecord, { ...builds, projected: before }),
          await buildCharacter(rulesetModule, characterRecord, { ...builds, projected: withLevel }),
        );
      }

      await deleteLevelChildren(tx, characterLevelId);
      await CharacterLevels.update(
        tx,
        {
          hp,
          abilityId: abilityId || null,
        },
        { id: characterLevelId },
      );

      await insertLevelChildren(tx, characterLevelId, skills, feats, powers);
      await reconcileAllBondedKinds(tx, rulesetModule, characterRecord, detailedCharacter, rulesetData);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetTable: getTableName(levelsInCharacter),
        type: "editLevel",
      });

      return characterLevel;
    });
  });
}
