/**
 * All level mutation operations.
 *
 * - updateLevel — re-saves an existing level with new selections
 * - removeLevel — deletes the most recent level
 * - finalizeLevelUp — commits one or more levels, distributing pooled selections across them
 */

import { levelsInCharacter } from "@/drizzle/schema.ts";
import { withTransaction, type Db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
} from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { PreloadedRulesetData } from "@/server/rulesets/types.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type { Session } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/utils.ts";
import { getTableName } from "drizzle-orm";
import {
  buildProjectedAutoGrantedFeats,
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  buildProjectedSelections,
  getLevelIdsFromOnward,
  loadFeatCustomizations,
} from "./helpers.ts";
import { validateAndFetchLevelSelections } from "./validation.ts";
import { computePerLevelAptitudeSlots, distributePoolSelections, type PerLevelDistributionData } from "./distribution.ts";
import { reconcileAllBondedKinds } from "./bondedReconcile.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";

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
    CharacterLevelSkills.create(tx, skillRows),
    CharacterLevelFeats.create(tx, featRows),
    CharacterLevelPowers.create(tx, powerRows),
  ]);
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
    const characterRecord = await Characters.findOneEditable(tx, {
      id: characterId,
      userId: session.userId,
    });
    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    return await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
      const characterLevel = await CharacterLevels.findOne(tx, {
        id: characterLevelId,
      });
      if (!characterLevel || characterLevel.characterId !== characterId) {
        throw new NotFoundError("Character level not found");
      }

      // Derive class/level from the existing character level
      const klassLevel = rulesetData.klassLevelsById.get(characterLevel.klassLevelId);
      if (!klassLevel) {
        throw new NotFoundError("Class level not found");
      }

      const klass = rulesetData.klassesById.get(klassLevel.klassId);
      if (!klass) {
        throw new NotFoundError("Class not found");
      }

      // Validate ability increase timing
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const existingLevels = await CharacterLevels.findMany(tx, { characterId });
      const filteredLevels = existingLevels.filter(
        (l) => l.id !== characterLevelId,
      );
      // Use the position of the edited level (sorted by creation order) as the totalLevel
      const sortedLevels = [...existingLevels].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const levelIndex = sortedLevels.findIndex((l) => l.id === characterLevelId);
      const isAbilityIncreaseLevel =
        rulesetModule.hooks.levels.isAbilityIncreaseLevel(levelIndex);

      if (abilityId && !isAbilityIncreaseLevel) {
        throw new BadRequestError(
          "Ability increase is not available at this level",
        );
      }
      if (!abilityId && isAbilityIncreaseLevel) {
        throw new BadRequestError("Ability increase is required at this level");
      }
      const validationResult = await validateAndFetchLevelSelections(tx, {
        klass,
        klassLevel,
        otherLevels: filteredLevels,
        hp,
        abilityId,
        skills,
        feats,
        powers,
        rulesetData,
      });
      const { fetchedFeats, featCustomizations, autoGrantedRecords } = validationResult;

      // The projected level must use a fresh id, not the real edited one. The
      // DB-side given-feat join filters by `levelsInCharacter.id IN
      // allCharacterLevelIds` — if the projected id matches a real row, the
      // edited level's auto-granted feats get loaded from DB *and* re-added
      // via `givenFeats`. Non-stackable feats dedup; stackable ones
      // (Bonus Feat (Fighter/Wizard)) don't, so their aptitude-grant modifier
      // fires twice and the level shows a phantom unspent slot.
      const projectedLevelId = crypto.randomUUID();

      const autoGrantedFeats = buildProjectedAutoGrantedFeats(
        autoGrantedRecords,
        klassLevel.id,
        projectedLevelId,
        new Set(fetchedFeats.map((f) => f.id)),
        featCustomizations,
      );

      const projectedData: Dnd35ProjectedCharacterData = {
        excludeCharacterLevelIds: [characterLevelId],
        characterLevels: [
          {
            id: projectedLevelId,
            characterId,
            klassLevelId: klassLevel.id,
            hp,
            abilityId: abilityId || null,
            createdAt: characterLevel.createdAt,
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
        ...buildProjectedSelections(klassLevel.id, projectedLevelId, skills, validationResult),
        givenFeats: autoGrantedFeats,
      };

      const detailedCharacter = rulesetModule.createDetailedCharacter(
        characterRecord,
      );
      await detailedCharacter.build(tx, projectedData);
      const { valid, issues } = detailedCharacter.validate();
      if (!valid && !force) {
        // Determine which aptitude pools this level contributes to so we only
        // report aptitude issues for pools owned by this level.
        // Compare baseline (before this level) vs baseline + projected level to isolate
        // only what THIS level grants, excluding contributions from later levels.
        const onwardIds = getLevelIdsFromOnward(existingLevels, characterLevelId);
        const baselineData: Dnd35ProjectedCharacterData = {
          excludeCharacterLevelIds: onwardIds,
        };
        const baselineCharacter = rulesetModule.createDetailedCharacter(
          characterRecord,
        );
        await baselineCharacter.build(tx, baselineData);
        const baselineApts = baselineCharacter
          .getDetailedCharacterAptitudes()
          .getAptitudes();
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
        // If withLevel misses any of them the affected pool stays out of
        // ownedPoolNames and real under-pick issues get filtered out.
        const projectedLevelForFilter = buildProjectedCharacterLevel(characterId, klassLevel.id);
        const withLevelData: Dnd35ProjectedCharacterData = {
          excludeCharacterLevelIds: onwardIds,
          characterLevels: [projectedLevelForFilter],
          givenFeats: buildProjectedGivenFeats(
            autoGrantedRecords,
            projectedLevelForFilter.id,
            featCustomizations,
          ),
          ...buildProjectedSelections(klassLevel.id, projectedLevelForFilter.id, skills, validationResult),
        };
        const withLevelCharacter = rulesetModule.createDetailedCharacter(
          characterRecord,
        );
        await withLevelCharacter.build(tx, withLevelData);
        const withLevelApts = withLevelCharacter
          .getDetailedCharacterAptitudes()
          .getAptitudes();
        const ownedPoolNames = new Set<string>();
        for (const apt of Object.values(withLevelApts)) {
          if (apt.allowed > (baselineAllowed.get(apt.name) ?? 0)) {
            ownedPoolNames.add(apt.name);
          }
        }

        // Filter: keep all non-aptitude issues, and only aptitude issues for pools this level owns
        const relevantIssues = issues.filter((issue) => {
          if (issue.category !== "aptitudes") return true;
          return [...ownedPoolNames].some((name) =>
            issue.message.startsWith(name),
          );
        });

        if (relevantIssues.length > 0) {
          throw new BadRequestError(
            relevantIssues.map((i) => i.message).join("; "),
            { issues: relevantIssues },
          );
        }
      }

      // Delete old children and update the character level
      await CharacterLevelSkills.deleteByCharacterLevelId(tx, { characterLevelId });
      await CharacterLevelFeats.deleteByCharacterLevelId(tx, { characterLevelId });
      await CharacterLevelPowers.deleteByCharacterLevelId(tx, { characterLevelId });

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
    const characterRecord = await Characters.findOneEditable(tx, {
      id: characterId,
      userId: session.userId,
    });
    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    const lastLevel = await CharacterLevels.findHighestCharacterLevel(tx, {
      characterId,
    });
    if (!lastLevel) {
      throw new NotFoundError("No level to remove.");
    }

    await CharacterLevelSkills.deleteByCharacterLevelId(tx, {
      characterLevelId: lastLevel.id,
    });
    await CharacterLevelFeats.deleteByCharacterLevelId(tx, {
      characterLevelId: lastLevel.id,
    });
    await CharacterLevelPowers.deleteByCharacterLevelId(tx, {
      characterLevelId: lastLevel.id,
    });
    await CharacterLevels.delete(tx, { id: lastLevel.id });

    await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
      const reconcileCharacter = rulesetModule.createDetailedCharacter(
        characterRecord,
      ) as Dnd35DetailedCharacter;
      await reconcileCharacter.build(tx, undefined, {
        ruleset, cowData: rulesetData.cow, rulesetData,
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
    const characterRecord = await Characters.findOneEditable(tx, {
      id: characterId,
      userId: session.userId,
    });
    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    return await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
      const { sourceChain } = rulesetData.cow;
      const rulesetIds = new Set([characterRecord.rulesetId, ...sourceChain]);

      const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);

      const preloadedRuleset: PreloadedRulesetData = { ruleset, cowData: rulesetData.cow, rulesetData };

      // ── Phase 1: Compute per-level distribution from pool selections ──

      // Resolve all klasses/klassLevels upfront — all reads from the composed
      // cache (no DB round trips inside the loop).
      const klassLevelEntries = levels.map(({ klassId, level }, i) => {
        const klass = rulesetData.klassesById.get(klassId);
        if (!klass || !rulesetIds.has(klass.rulesetId)) {
          throw new BadRequestError(
            `Level ${i + 1}: Class does not belong to the character's ruleset`,
          );
        }
        if (klass.kind !== "pc") {
          throw new BadRequestError(
            `Level ${i + 1}: Class is not valid for a player character`,
          );
        }
        const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
        if (!klassLevel) {
          throw new NotFoundError(`Level ${i + 1}: Class level not found`);
        }
        return { klass, klassLevel, abilityId: levels[i].abilityId };
      });

      // Early ruleset-lineage check for submitted entity IDs. Per-level
      // validateAndFetchLevelSelections re-checks these, but it runs *after*
      // the Phase 1 character build below, which assumes all referenced
      // entities resolve in the ruleset's composed cache. Throwing up-front
      // keeps the user-facing error targeted (BadRequestError) instead of a
      // downstream TypeError from the aptitude builder.
      const submittedSkillIds = Object.keys(skills).filter((id) => skills[id] > 0);
      const submittedFeatIds = [...new Set(Object.values(feats).flat())];
      const submittedPowerIds = [...new Set(Object.values(powers).flat())];
      const submittedAptitudeIds = [...new Set([...Object.keys(feats), ...Object.keys(powers)])];
      for (const id of submittedSkillIds) {
        if (!rulesetData.skillsById.has(id)) throw new BadRequestError("One or more skills not found");
      }
      for (const id of submittedFeatIds) {
        if (!rulesetData.featsById.has(id)) throw new BadRequestError("One or more feats not found");
      }
      for (const id of submittedPowerIds) {
        if (!rulesetData.powersById.has(id)) throw new BadRequestError("One or more powers not found");
      }
      for (const id of submittedAptitudeIds) {
        if (!rulesetData.aptitudesById.has(id)) throw new BadRequestError("One or more aptitudes not found");
      }
      for (const [aptitudeId, ids] of Object.entries(feats)) {
        for (const featId of ids) {
          const feat = rulesetData.featsById.get(featId);
          const links = feat?.featsAptitudesInRules ?? [];
          if (!links.some((fa) => fa.aptitudeId === aptitudeId)) {
            throw new BadRequestError("Feat is not linked to the specified aptitude");
          }
        }
      }
      for (const [aptitudeId, ids] of Object.entries(powers)) {
        for (const powerId of ids) {
          const power = rulesetData.powersById.get(powerId);
          const link = power?.powersAptitudesInRules.find((pa) => pa.aptitudeId === aptitudeId);
          if (!link) {
            throw new BadRequestError("Power is not linked to the specified aptitude");
          }
        }
      }

      const baseExistingLevels = await CharacterLevels.findMany(tx, {
        characterId,
      });

      // Build projected character levels + auto-granted feats for aptitude pool computation
      const projectedCharacterLevels = klassLevelEntries.map(
        ({ klassLevel, abilityId }) =>
          buildProjectedCharacterLevel(characterId, klassLevel.id, abilityId),
      );

      const allAutoGrantedFeatRecords = klassLevelEntries.map(({ klassLevel }) =>
        preloadedRuleset.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [],
      );
      const flatAutoGrantedFeats = allAutoGrantedFeatRecords.flat();
      const autoGrantedFeatCustomizations = loadFeatCustomizations(
        preloadedRuleset.rulesetData,
        flatAutoGrantedFeats.map((rec) => rec.featsInRule.id),
      );

      const projectedData: Dnd35ProjectedCharacterData = {
        characterLevels: projectedCharacterLevels,
        givenFeats: allAutoGrantedFeatRecords.flatMap((records, i) =>
          buildProjectedGivenFeats(records, projectedCharacterLevels[i].id, autoGrantedFeatCustomizations),
        ),
      };

      // Build full character with all planned levels to get aptitude pools
      const fullCharacter = rulesetModule.createDetailedCharacter(
        characterRecord,
      );
      await fullCharacter.build(tx, projectedData);
      const levelUpProjector = rulesetModule.createLevelUpProjector(fullCharacter) as Dnd35LevelUpProjector;
      const aptitudesInstance = fullCharacter.getDetailedCharacterAptitudes();
      const aptitudes = aptitudesInstance.getAptitudes();

      // Determine feat vs power aptitude pools
      const featPoolIds: string[] = [];
      const powerPoolIds: string[] = [];
      const nonLeveledAptitudeIds: string[] = [];

      for (const [key, aptitude] of Object.entries(aptitudes)) {
        if (aptitudesInstance.isLeveledAptitude(key)) {
          powerPoolIds.push(aptitude.id);
        } else {
          nonLeveledAptitudeIds.push(aptitude.id);
        }
      }

      const sharedAptitudeIds = new Set(
        nonLeveledAptitudeIds.filter((id) => preloadedRuleset.rulesetData.aptitudeIdsByHavingPowers.has(id)),
      );
      for (const aptId of nonLeveledAptitudeIds) {
        if (sharedAptitudeIds.has(aptId)) {
          powerPoolIds.push(aptId);
        }
        featPoolIds.push(aptId);
      }

      // Compute per-level feat/power slots from modifier data directly
      const preloaded = await fullCharacter.preload();
      const baselineCharacter = rulesetModule.createDetailedCharacter(
        characterRecord,
      );
      await baselineCharacter.build(tx, undefined, preloaded);
      const baselineApts = baselineCharacter
        .getDetailedCharacterAptitudes()
        .getAptitudes();

      const klassLevelIds = klassLevelEntries.map(
        ({ klassLevel }) => klassLevel.id,
      );

      const { perLevelFeatSlots, perLevelPowerSlots } =
        computePerLevelAptitudeSlots(
          rulesetData,
          klassLevelIds,
          allAutoGrantedFeatRecords,
          featPoolIds,
          powerPoolIds,
          baseExistingLevels.length,
          baselineApts,
        );

      // Compute per-level skill points
      const { perLevel: perLevelSkillPoints } = await levelUpProjector.computeSkillPointsPerLevel(
        klassLevelIds, baseExistingLevels.length, rulesetData,
      );

      // Compute per-level class skill IDs
      const allKlassIds = [...new Set(levels.map((l) => l.klassId))];
      const allKlassSkillRecords = allKlassIds.map(
        (klassId) => rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [],
      );
      const allSkills = rulesetData.skills;

      const perLevelClassSkillIds: string[][] = [];
      for (const { klass } of klassLevelEntries) {
        const klassSkillRecords =
          allKlassSkillRecords.find(
            (records) => records.length > 0 && records[0].klassId === klass.id,
          ) ?? [];
        const klassSkillIds = new Set(klassSkillRecords.map((ks) => ks.skillId));
        const klassSkillNames = new Set(
          klassSkillRecords.map((ks) => ks.skillsInRule.name),
        );
        const levelClassSkillIds = allSkills
          .filter(
            (s) =>
              klassSkillIds.has(s.id) ||
              [...klassSkillNames].some((name) => s.name.startsWith(`${name} (`)),
          )
          .map((s) => s.id);
        perLevelClassSkillIds.push(levelClassSkillIds);
      }

      // Build skill contexts (current rank + class skill status)
      const characterSkills = levelUpProjector.getCharacterSkills();
      const mergedClassSkillIds = new Set(
        allKlassSkillRecords.flat().map((ks) => ks.skillId),
      );
      const mergedClassSkillNames = new Set(
        allKlassSkillRecords.flat().map((ks) => ks.skillsInRule.name),
      );
      for (const skill of allSkills) {
        if (
          !mergedClassSkillIds.has(skill.id) &&
          [...mergedClassSkillNames].some((name) =>
            skill.name.startsWith(`${name} (`),
          )
        ) {
          mergedClassSkillIds.add(skill.id);
        }
      }
      const skillContexts = new Map<
        string,
        { isClassSkill: boolean; currentRank: number }
      >();
      for (const skill of allSkills) {
        const skillData = characterSkills[stripSeparators(skill.name)] as
          | { innate?: boolean; rank?: number }
          | undefined;
        skillContexts.set(skill.id, {
          isClassSkill: skillData?.innate ?? mergedClassSkillIds.has(skill.id),
          currentRank: skillData?.rank || 0,
        });
      }

      // Look up power levels for leveled aptitude distribution.
      // Key by powerId:aptitudeId since a spell can be at different levels in different aptitudes
      // (e.g., a spell at Wizard L1 but Bard L0). Read straight from the cached
      // inline `powersAptitudesInRules` join rows.
      const allPowerIds = Object.values(powers).flat();
      const powerLevelLookup = new Map<string, number | null>();
      for (const powerId of allPowerIds) {
        const power = rulesetData.powersById.get(powerId);
        if (!power) continue;
        for (const pa of power.powersAptitudesInRules) {
          powerLevelLookup.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
        }
      }

      // Build deferred aptitude source map (for modifier-created pools).
      // Match each deferred aptitude to the first-pass feat whose modifier targets it.
      const deferredAptitudeIds = Object.keys(feats).filter(
        (aptId) => !(perLevelFeatSlots[aptId] ?? []).some((s) => s > 0),
      );
      const deferredAptitudeSources = new Map<string, string>();

      if (deferredAptitudeIds.length > 0) {
        const deferredAptIdSet = new Set(deferredAptitudeIds);

        const firstPassFeatIds = Object.entries(feats)
          .filter(([aptId]) =>
            (perLevelFeatSlots[aptId] ?? []).some((s) => s > 0),
          )
          .flatMap(([, ids]) => ids);

        for (const featId of firstPassFeatIds) {
          const mods = rulesetData.modifiersBySource.get(featId);
          if (!mods) continue;
          for (const mod of mods) {
            // Match modifier target "aptitudes.<slug>.allowed" to a deferred aptitude
            const match = mod.target.match(/^aptitudes\.(\w+)\..*allowed/);
            if (!match) continue;
            const aptId = rulesetData.aptitudeIdBySlug.get(match[1]);
            if (aptId && deferredAptIdSet.has(aptId)) {
              deferredAptitudeSources.set(aptId, mod.sourceId);
            }
          }
        }
      }

      // Run distribution
      const distributionData: PerLevelDistributionData = {
        perLevelSkillPoints,
        perLevelClassSkillIds,
        perLevelFeatSlots,
        perLevelPowerSlots,
        baseCharacterLevel: baseExistingLevels.length,
        skillContexts,
      };
      const distributedLevels = distributePoolSelections(
        distributionData,
        skills,
        feats,
        powers,
        powerLevelLookup,
        deferredAptitudeSources,
      );

      // ── Phase 2: Per-level validation and insertion ──

      const createdLevels: Awaited<
        ReturnType<typeof CharacterLevels.create>
      >[number][] = [];

      // Stagger createdAt by row so multi-level batches retain their order even
      // after the transaction commits. Without this every row in the loop gets
      // the same now() (transaction start time) and any subsequent edit-level
      // flow ordering by createdAt would be non-deterministic.
      const batchStartedAt = Date.now();

      for (let i = 0; i < levels.length; i++) {
        const { hp, abilityId } = levels[i];
        const { klass, klassLevel } = klassLevelEntries[i];
        const {
          skills: levelSkills,
          feats: levelFeats,
          powers: levelPowers,
        } = distributedLevels[i];

        // Reject re-finalizing an already-existing level
        const existingLevel = await CharacterLevels.findOne(tx, {
          characterId,
          klassLevelId: klassLevel.id,
        });
        if (existingLevel) {
          throw new BadRequestError(
            `Level ${i + 1}: This level has already been finalized`,
          );
        }

        // Validate ability increase timing using base count + plan offset
        const totalLevelCount = baseExistingLevels.length + i;
        const isAbilityIncreaseLevel =
          rulesetModule.hooks.levels.isAbilityIncreaseLevel(totalLevelCount);

        if (abilityId && !isAbilityIncreaseLevel) {
          throw new BadRequestError(
            `Level ${i + 1}: Ability increase is not available at this level`,
          );
        }
        if (!abilityId && isAbilityIncreaseLevel) {
          throw new BadRequestError(
            `Level ${i + 1}: Ability increase is required at this level`,
          );
        }

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

      const detailedCharacter = rulesetModule.createDetailedCharacter(
        characterRecord,
      ) as Dnd35DetailedCharacter;
      await detailedCharacter.build(tx, undefined, preloadedRuleset);

      if (!force) {
        const { valid, issues } = detailedCharacter.validate();
        if (!valid) {
          throw new BadRequestError(
            issues.map((iss) => iss.message).join("; "),
            { issues },
          );
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
