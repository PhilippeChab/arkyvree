/**
 * Slot/point allocation queries for the level-up wizard steps.
 *
 * - getSkillSlots — skill points available and skill list with class info
 * - getFeatSlots / getEditFeatSlots — feat aptitude pools (new level / edit mode)
 * - getPowerSlots / getEditPowerSlots — power aptitude pools (new level / edit mode)
 * - getAttributeSlots — ability score increase availability
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterLevels } from "@/server/repositories/index.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { Session } from "@/shared/relations.ts";

import { getClassSkillIds, getKlassLevel } from "./classes.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  getLevelIdsFromOnward,
  loadFeatCustomizations,
} from "./projection.ts";

/** What a level-up step projects: a new level after the levels planned before it, or an edit of one of the character's. */
type LevelProjection = {
  /** The level edited, which the projected level replaces. */
  editedLevelId?: string;
  /** The projected level's ability increase. */
  abilityId?: string;
  pendingLevelKlassLevelIds?: string[];
  pendingLevelAbilityIds?: (string | undefined)[];
};

/** A projected character's spell pools, without the non-leveled aptitudes no spell belongs to (feat pools). */
function spellPools(aptitudes: DetailedCharacterAptitudes, rulesetData: CachedRulesetData) {
  const pools = aptitudes.extractPowerPools();
  for (const aptitudeId of aptitudes.getNonLeveledAptitudeIds()) {
    if (!rulesetData.aptitudeIdsByHavingPowers.has(aptitudeId)) delete pools[aptitudeId];
  }
  return pools;
}

/** The feat pools of a projected level: a pool is shared when its aptitude has spells too, and isn't counted then. */
async function featSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  projection: LevelProjection,
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const klassLevel = getKlassLevel(rulesetData, klassId, level);
    const autoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];
    const autoGrantedCustomizations = loadFeatCustomizations(
      rulesetData,
      autoGrantedRecords.map((rec) => rec.featsInRule.id),
    );

    const { level: projectedLevel, data } = await projectLevel(characterId, klassLevel.id, projection);
    const projectedData: Dnd35ProjectedCharacterData = {
      ...data,
      givenFeats: buildProjectedGivenFeats(autoGrantedRecords, projectedLevel.id, autoGrantedCustomizations),
    };

    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);

    const aptitudePools = detailedCharacter.getDetailedCharacterAptitudes().extractFeatPools();
    let featsToSelect = 0;
    for (const pool of Object.values(aptitudePools)) {
      pool.shared = rulesetData.aptitudeIdsByHavingPowers.has(pool.id);
      if (!pool.shared) featsToSelect += pool.available;
    }

    return {
      featsToSelect,
      autoGrantedFeats: autoGrantedRecords.map((rec) => rec.featsInRule),
      aptitudePools,
    };
  });
}

/** The spell pools of a projected level, and the powers its class level grants. */
async function powerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  projection: LevelProjection,
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const klassLevel = getKlassLevel(rulesetData, klassId, level);
    const { data: projectedData } = await projectLevel(characterId, klassLevel.id, projection);

    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);

    const aptitudePools = spellPools(detailedCharacter.getDetailedCharacterAptitudes(), rulesetData);
    const powersToSelect = Object.values(aptitudePools).reduce((total, pool) => total + pool.available, 0);
    const autoGrantedPowers = (rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? []).map(
      (rec) => ({ ...rec.powersInRule, free: rec.free }),
    );

    return { powersToSelect, autoGrantedPowers, aptitudePools };
  });
}

/**
 * The projected level of class level `klassLevelId`, and the projection it goes in. An edited level's replacement
 * keeps its creation time, so the first character level stays the first (its x4 skill points, its feats); its id is
 * fresh, so the data loader doesn't count the stored level's granted feats twice.
 */
async function projectLevel(characterId: string, klassLevelId: string, projection: LevelProjection) {
  const { editedLevelId, abilityId, pendingLevelKlassLevelIds, pendingLevelAbilityIds } = projection;
  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
    : [];
  let level = buildProjectedCharacterLevel(characterId, klassLevelId, abilityId);
  if (editedLevelId) {
    const levels = await CharacterLevels.findMany(db, { characterId });
    const editedLevel = levels.find((l) => l.id === editedLevelId);
    if (!editedLevel) throw new NotFoundError("Character level not found");
    level = { ...level, createdAt: editedLevel.createdAt };
  }
  const data: Dnd35ProjectedCharacterData = {
    ...(editedLevelId && { excludeCharacterLevelIds: [editedLevelId] }),
    characterLevels: [...pendingLevels, level],
  };
  return { level, data };
}

export async function getAttributeSlots(
  session: Session,
  characterId: string,
  excludeCharacterLevelId?: string,
  pendingLevelCount?: number,
) {
  const characterRecord = await getEditableCharacter(db, session, characterId);

  const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
  const characterLevels = await CharacterLevels.findMany(db, { characterId });
  const excludeIds = excludeCharacterLevelId ? getLevelIdsFromOnward(characterLevels, excludeCharacterLevelId) : [];
  // totalLevel = number of levels before this one (so totalLevel+1 = the level being added/edited)
  const totalLevel = characterLevels.length - excludeIds.length + (pendingLevelCount ?? 0);

  if (!rulesetModule.hooks.levels.isAbilityIncreaseLevel(totalLevel)) {
    return {
      isAvailable: false,
      attributes: {},
    };
  }

  const projectedData: Dnd35ProjectedCharacterData | undefined =
    excludeIds.length > 0 ? { excludeCharacterLevelIds: excludeIds } : undefined;

  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(undefined, projectedData);
  const abilities = detailedCharacter.getDetailedCharacterAbilities();

  return {
    isAvailable: true,
    attributes: abilities.getAbilitiesWithIds(),
  };
}

export async function getEditFeatSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  characterLevelId: string,
) {
  return await featSlots(session, characterId, klassId, level, { editedLevelId: characterLevelId });
}

export async function getEditPowerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  characterLevelId: string,
) {
  return await powerSlots(session, characterId, klassId, level, { editedLevelId: characterLevelId });
}

export async function getFeatSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  pendingLevelKlassLevelIds?: string[],
) {
  return await featSlots(session, characterId, klassId, level, { pendingLevelKlassLevelIds });
}

export async function getPowerSlots(
  session: Session,
  characterId: string,
  klassId: string,
  level: number,
  pendingLevelKlassLevelIds?: string[],
) {
  return await powerSlots(session, characterId, klassId, level, { pendingLevelKlassLevelIds });
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
  const characterRecord = await getEditableCharacter(db, session, characterId);

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
    const klassLevel = getKlassLevel(rulesetData, klassId, level);
    const { data: projectedData } = await projectLevel(characterId, klassLevel.id, {
      editedLevelId: excludeCharacterLevelId,
      abilityId,
      pendingLevelKlassLevelIds,
      pendingLevelAbilityIds,
    });

    const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
    const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
    await detailedCharacter.build(undefined, projectedData);

    const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;
    const skillsBreakdown = levelUpProjector.getSkillBudget();

    // isClassSkill = class skill for ANY of the character's classes (for max rank).
    // isCurrentClassSkill = class skill for the class being leveled (for cost).
    const currentClassSkillIds = getClassSkillIds(
      rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [],
      rulesetData.skills,
    );
    const skillsWithClassInfo = levelUpProjector.getCharacterEnrichedSkills(rulesetData.skills, currentClassSkillIds);

    // Total character level after the projected change. Used client-side for
    // the 3.5 rank cap (`totalCharacterLevel + 3` for class skills,
    // `(totalCharacterLevel + 3) / 2` for cross-class). An edit replaces
    // the edited level, so the count stays the total.
    const characterLevels = await CharacterLevels.findMany(db, { characterId });
    const totalCharacterLevel = characterLevels.length + (excludeCharacterLevelId ? 0 : 1);

    return {
      skillPointsToSpend: Math.max(1, skillsBreakdown.available),
      totalCharacterLevel,
      skills: skillsWithClassInfo,
    };
  });
}
