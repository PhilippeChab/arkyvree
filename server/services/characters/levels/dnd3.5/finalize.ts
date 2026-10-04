/**
 * All level mutation operations.
 *
 * - updateLevel — re-saves an existing level with new selections
 * - removeLevel — deletes the most recent level
 * - finalizeLevelUp — commits one or more levels, distributing pooled selections across them
 */

import { getTableName } from "drizzle-orm";

import { levelsInCharacter } from "@/drizzle/schema.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { type Db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { PreloadedRulesetData, RulesetModule } from "@/server/rulesets/types.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { reconcileAllBondedKinds } from "./bondedReconcile.ts";
import { plannedClassSkills, plannedKlassLevels, savedKlassLevel } from "./classes.ts";
import {
  computePerLevelAptitudeSlots,
  deferredAptitudeSources,
  distributePoolSelections,
  type PerLevelDistributionData,
  powerLevelLookup,
  skillContexts,
} from "./distribution.ts";
import {
  baselineAptitudes,
  buildProjectedAutoGrantedFeats,
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  buildProjectedSelections,
  getLevelIdsFromOnward,
  projectPlannedLevels,
} from "./projection.ts";
import { checkAbilityIncrease, checkSelections, validateAndFetchLevelSelections } from "./validation.ts";

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

  await Promise.all([
    CharacterLevelSkills.createMany(tx, skillRows),
    CharacterLevelFeats.createMany(tx, featRows),
    CharacterLevelPowers.createMany(tx, powerRows),
  ]);
}

type LevelSelections = Awaited<ReturnType<typeof validateAndFetchLevelSelections>>;

/** Deletes a character level's skills, feats and powers. */
async function deleteLevelChildren(tx: Db, characterLevelId: string) {
  await CharacterLevelSkills.delete(tx, { characterLevelId });
  await CharacterLevelFeats.delete(tx, { characterLevelId });
  await CharacterLevelPowers.delete(tx, { characterLevelId });
}

/** The edited level's projection: the level with its new HP, ability and selections, in place of its saved row. */
function projectEdit(
  characterId: string,
  characterLevel: { id: string; createdAt: string },
  klassLevelId: string,
  hp: number,
  abilityId: string | null,
  skills: Record<string, number>,
  validationResult: LevelSelections,
): Dnd35ProjectedCharacterData {
  const { fetchedFeats, featCustomizations, autoGrantedRecords } = validationResult;

  // A fresh id keeps the projected level apart from the edited row it
  // replaces. The loader drops that row (`excludeCharacterLevelIds`) and
  // fetches granted feats for the saved levels only, so the projected
  // level's come from `givenFeats` alone.
  const projectedLevelId = crypto.randomUUID();

  const autoGrantedFeats = buildProjectedAutoGrantedFeats(
    autoGrantedRecords,
    klassLevelId,
    projectedLevelId,
    new Set(fetchedFeats.map((f) => f.id)),
    featCustomizations,
  );

  return {
    excludeCharacterLevelIds: [characterLevel.id],
    characterLevels: [
      {
        id: projectedLevelId,
        characterId,
        klassLevelId,
        hp,
        abilityId: abilityId || null,
        createdAt: characterLevel.createdAt,
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
    ],
    ...buildProjectedSelections(klassLevelId, projectedLevelId, skills, validationResult),
    givenFeats: autoGrantedFeats,
  };
}

/**
 * The aptitude pools the edited level contributes to: those the character allows more of with the level than before
 * it. Both builds leave out the level and every later one, so only what THIS level grants counts.
 */
async function ownedPoolNames(
  tx: Db,
  rulesetModule: RulesetModule,
  characterRecord: Character,
  existingLevels: { id: string; createdAt: string }[],
  characterLevelId: string,
  klassLevelId: string,
  skills: Record<string, number>,
  validationResult: LevelSelections,
) {
  const { featCustomizations, autoGrantedRecords } = validationResult;
  const onwardIds = getLevelIdsFromOnward(existingLevels, characterLevelId);
  const baselineData: Dnd35ProjectedCharacterData = {
    excludeCharacterLevelIds: onwardIds,
  };
  const baselineCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await baselineCharacter.build(tx, baselineData);
  const baselineApts = baselineCharacter.getDetailedCharacterAptitudes().getAptitudes();
  const baselineAllowed = new Map<string, number>();
  for (const apt of Object.values(baselineApts)) {
    baselineAllowed.set(apt.name, apt.allowed);
  }

  // Mirror the primary projection's shape exactly: auto-grants via
  // `givenFeats` and the user's submitted feats/skills/powers via
  // `buildProjectedSelections`. Any entity attached to this level —
  // auto-granted or user-picked — can carry an
  // `aptitudes.<x>.allowed += N` modifier (Bonus Feat (Fighter)
  // auto-grants Fighter Bonus Feat, Wizard specialization picks grant
  // Prohibited School, War Domain grants War Domain Weapon, etc.).
  // If withLevelData misses any of them the affected pool stays out of
  // ownedPoolNames and real under-pick issues get filtered out.
  const projectedLevelForFilter = buildProjectedCharacterLevel(characterRecord.id, klassLevelId);
  const withLevelData: Dnd35ProjectedCharacterData = {
    excludeCharacterLevelIds: onwardIds,
    characterLevels: [projectedLevelForFilter],
    givenFeats: buildProjectedGivenFeats(autoGrantedRecords, projectedLevelForFilter.id, featCustomizations),
    ...buildProjectedSelections(klassLevelId, projectedLevelForFilter.id, skills, validationResult),
  };
  const withLevelCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await withLevelCharacter.build(tx, withLevelData);
  const withLevelApts = withLevelCharacter.getDetailedCharacterAptitudes().getAptitudes();
  const owned = new Set<string>();
  for (const apt of Object.values(withLevelApts)) {
    if (apt.allowed > (baselineAllowed.get(apt.name) ?? 0)) {
      owned.add(apt.name);
    }
  }
  return owned;
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
    const characterRecord = await getEditableCharacter(tx, session, characterId);

    return await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
      const characterLevel = await CharacterLevels.findOne(tx, {
        id: characterLevelId,
      });
      if (!characterLevel || characterLevel.characterId !== characterId) {
        throw new NotFoundError("Character level not found");
      }
      const { klassLevel, klass } = savedKlassLevel(rulesetData, characterLevel);

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const existingLevels = await CharacterLevels.findMany(tx, { characterId });
      // Use the position of the edited level (sorted by creation order) as the totalLevel
      const sortedLevels = [...existingLevels].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const levelIndex = sortedLevels.findIndex((l) => l.id === characterLevelId);
      checkAbilityIncrease(rulesetModule.hooks.levels.isAbilityIncreaseLevel(levelIndex), abilityId);
      const validationResult = await validateAndFetchLevelSelections(tx, {
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

      const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
      await detailedCharacter.build(
        tx,
        projectEdit(characterId, characterLevel, klassLevel.id, hp, abilityId, skills, validationResult),
      );
      const { valid, issues } = detailedCharacter.validate();
      if (!valid && !force) {
        // Keep all non-aptitude issues, and only aptitude issues for pools this level owns
        const owned = await ownedPoolNames(
          tx,
          rulesetModule,
          characterRecord,
          existingLevels,
          characterLevelId,
          klassLevel.id,
          skills,
          validationResult,
        );
        const relevantIssues = issues.filter(
          (issue) => issue.category !== "aptitudes" || [...owned].some((name) => issue.message.startsWith(name)),
        );
        if (relevantIssues.length > 0) {
          throw new BadRequestError(relevantIssues.map((i) => i.message).join("; "), { issues: relevantIssues });
        }
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
      await reconcileAllBondedKinds(tx, characterRecord, detailedCharacter as Dnd35DetailedCharacter, rulesetData);

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

/** Removes the most recent character level and all its children (skills, feats, powers). */
export async function removeLevel(session: Session, characterId: string) {
  return await withTransaction(async (tx) => {
    const characterRecord = await getEditableCharacter(tx, session, characterId);

    const lastLevel = await CharacterLevels.findLatest(tx, {
      characterId,
    });
    if (!lastLevel) {
      throw new NotFoundError("No level to remove.");
    }

    await deleteLevelChildren(tx, lastLevel.id);
    await CharacterLevels.delete(tx, { id: lastLevel.id });

    await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const reconcileCharacter = rulesetModule.createDetailedCharacter(characterRecord) as Dnd35DetailedCharacter;
      await reconcileCharacter.build(tx, undefined, {
        ruleset,
        cowData: rulesetData.cow,
        rulesetData,
      });
      await reconcileAllBondedKinds(tx, characterRecord, reconcileCharacter, rulesetData);
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
 * The feat and power pools of the character with its planned levels: a leveled aptitude is a power pool, an unleveled
 * one a feat pool, and a power pool too when it has powers.
 */
function poolIds(aptitudesInstance: DetailedCharacterAptitudes, rulesetData: CachedRulesetData) {
  const featPoolIds: string[] = [];
  const powerPoolIds: string[] = [];
  const nonLeveledAptitudeIds: string[] = [];

  for (const [key, aptitude] of Object.entries(aptitudesInstance.getAptitudes())) {
    if (aptitudesInstance.isLeveledAptitude(key)) {
      powerPoolIds.push(aptitude.id);
    } else {
      nonLeveledAptitudeIds.push(aptitude.id);
    }
  }

  const sharedAptitudeIds = new Set(
    nonLeveledAptitudeIds.filter((id) => rulesetData.aptitudeIdsByHavingPowers.has(id)),
  );
  for (const aptId of nonLeveledAptitudeIds) {
    if (sharedAptitudeIds.has(aptId)) {
      powerPoolIds.push(aptId);
    }
    featPoolIds.push(aptId);
  }
  return { featPoolIds, powerPoolIds };
}

/**
 * Phase 1's distribution data: each planned level's skill points, class skills and pool slots, from the character
 * built with every planned level, and its skills as they are.
 */
async function levelDistributionData(
  tx: Db,
  rulesetModule: RulesetModule,
  characterRecord: Character,
  rulesetData: CachedRulesetData,
  klassLevelEntries: ReturnType<typeof plannedKlassLevels>,
  baseLevelCount: number,
): Promise<PerLevelDistributionData> {
  const { projectedData, allAutoGrantedFeatRecords } = projectPlannedLevels(
    characterRecord.id,
    klassLevelEntries,
    rulesetData,
  );

  // Build full character with all planned levels to get aptitude pools
  const fullCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await fullCharacter.build(tx, projectedData);
  const levelUpProjector = rulesetModule.createLevelUpProjector(fullCharacter) as Dnd35LevelUpProjector;
  const { featPoolIds, powerPoolIds } = poolIds(fullCharacter.getDetailedCharacterAptitudes(), rulesetData);

  // Compute per-level feat/power slots from modifier data directly
  const baselineApts = await baselineAptitudes(tx, rulesetModule, characterRecord, fullCharacter);
  const klassLevelIds = klassLevelEntries.map(({ klassLevel }) => klassLevel.id);
  const { perLevelFeatSlots, perLevelPowerSlots } = computePerLevelAptitudeSlots(
    rulesetData,
    klassLevelIds,
    allAutoGrantedFeatRecords,
    featPoolIds,
    powerPoolIds,
    baseLevelCount,
    baselineApts,
  );

  const { perLevel: perLevelSkillPoints } = await levelUpProjector.computeSkillPointsPerLevel(
    klassLevelIds,
    baseLevelCount,
    rulesetData,
  );
  const classSkills = plannedClassSkills(
    rulesetData,
    klassLevelEntries.map(({ klass }) => klass.id),
  );

  return {
    perLevelSkillPoints,
    perLevelClassSkillIds: classSkills.perLevel,
    perLevelFeatSlots,
    perLevelPowerSlots,
    baseCharacterLevel: baseLevelCount,
    skillContexts: skillContexts(levelUpProjector, rulesetData.skills, classSkills.merged),
  };
}

/**
 * Phase 2: validates and inserts each planned level with its share of the selections, in order, so each one sees the
 * levels before it.
 */
async function insertPlannedLevels(
  tx: Db,
  rulesetModule: RulesetModule,
  rulesetData: CachedRulesetData,
  characterId: string,
  levels: { hp: number; abilityId: string | null }[],
  klassLevelEntries: ReturnType<typeof plannedKlassLevels>,
  distributedLevels: ReturnType<typeof distributePoolSelections>,
  baseExistingLevels: Awaited<ReturnType<typeof CharacterLevels.findMany>>,
) {
  const createdLevels: Awaited<ReturnType<typeof CharacterLevels.create>>[number][] = [];

  // Stagger createdAt by row so multi-level batches retain their order even
  // after the transaction commits. Without this every row in the loop gets
  // the same now() (transaction start time) and any subsequent edit-level
  // flow ordering by createdAt would be non-deterministic.
  const batchStartedAt = Date.now();

  for (let i = 0; i < levels.length; i++) {
    const { hp, abilityId } = levels[i];
    const { klass, klassLevel } = klassLevelEntries[i];
    const { skills: levelSkills, feats: levelFeats, powers: levelPowers } = distributedLevels[i];

    // Reject re-finalizing an already-existing level
    const existingLevel = await CharacterLevels.findOne(tx, {
      characterId,
      klassLevelId: klassLevel.id,
    });
    if (existingLevel) {
      throw new BadRequestError(`Level ${i + 1}: This level has already been finalized`);
    }

    // Validate ability increase timing using base count + plan offset
    const totalLevelCount = baseExistingLevels.length + i;
    checkAbilityIncrease(
      rulesetModule.hooks.levels.isAbilityIncreaseLevel(totalLevelCount),
      abilityId,
      `Level ${i + 1}: `,
    );

    // baseExistingLevels (from before the loop) + levels we've inserted so
    // far in this iteration covers what a fresh findMany would return,
    // without the per-iteration round-trip.
    const existingLevels = [...baseExistingLevels, ...createdLevels];

    await validateAndFetchLevelSelections(tx, {
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
    const rowCreatedAt = new Date(batchStartedAt + i).toISOString();
    const rows = await CharacterLevels.create(tx, {
      characterId,
      klassLevelId: klassLevel.id,
      hp,
      abilityId: abilityId || null,
      createdAt: rowCreatedAt,
      updatedAt: rowCreatedAt,
    });
    const characterLevel = rows[0];
    createdLevels.push(characterLevel);

    await insertLevelChildren(tx, characterLevel.id, levelSkills, levelFeats, levelPowers);
  }
  return createdLevels;
}

/** Commits one or more levels at once. Distributes pooled selections (skills, feats, powers) across levels, then validates and inserts each sequentially within a single transaction. */
export async function finalizeLevelUp(
  session: Session,
  characterId: string,
  levels: Array<{
    klassId: string;
    level: number;
    hp: number;
    abilityId: string | null;
  }>,
  skills: Record<string, number>,
  feats: Record<string, string[]>,
  powers: Record<string, string[]>,
  force: boolean = false,
) {
  return await withTransaction(async (tx) => {
    const characterRecord = await getEditableCharacter(tx, session, characterId);

    return await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const rulesetIds = new Set([characterRecord.rulesetId, ...sourceChain]);

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);

      const preloadedRuleset: PreloadedRulesetData = { ruleset, cowData: rulesetData.cow, rulesetData };

      // ── Phase 1: Compute per-level distribution from pool selections ──

      // Resolve all klasses/klassLevels upfront — all reads from the composed
      // cache (no DB round trips inside the loop).
      const klassLevelEntries = plannedKlassLevels(rulesetData, levels, rulesetIds);

      // Early ruleset-lineage check for submitted entity IDs. Per-level
      // validateAndFetchLevelSelections re-checks these, but it runs *after*
      // the Phase 1 character build below, which assumes all referenced
      // entities resolve in the ruleset's composed cache. Throwing up-front
      // keeps the user-facing error targeted (BadRequestError) instead of a
      // downstream TypeError from the aptitude builder.
      checkSelections(rulesetData, skills, feats, powers);

      const baseExistingLevels = await CharacterLevels.findMany(tx, {
        characterId,
      });

      const distributionData = await levelDistributionData(
        tx,
        rulesetModule,
        characterRecord,
        rulesetData,
        klassLevelEntries,
        baseExistingLevels.length,
      );
      const distributedLevels = distributePoolSelections(
        distributionData,
        skills,
        feats,
        powers,
        powerLevelLookup(rulesetData, Object.values(powers).flat()),
        deferredAptitudeSources(rulesetData, feats, distributionData.perLevelFeatSlots),
      );

      // ── Phase 2: Per-level validation and insertion ──
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

      const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord) as Dnd35DetailedCharacter;
      await detailedCharacter.build(tx, undefined, preloadedRuleset);

      if (!force) {
        const { valid, issues } = detailedCharacter.validate();
        if (!valid) {
          throw new BadRequestError(issues.map((iss) => iss.message).join("; "), { issues });
        }
      }

      await reconcileAllBondedKinds(tx, characterRecord, detailedCharacter, rulesetData);

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
