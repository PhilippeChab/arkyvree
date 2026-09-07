/**
 * Slot/point allocation queries for the level-up wizard steps.
 *
 * - getSkillSlots — skill points available and skill list with class info
 * - getFeatSlots / getEditFeatSlots — feat aptitude pools (new level / edit mode)
 * - getPowerSlots / getEditPowerSlots — power aptitude pools (new level / edit mode)
 * - getAttributeSlots — ability score increase availability
 */

import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevels,
  Characters,
} from "@/server/repositories/index.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { Dnd35LevelUpProjector, Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import type { Session } from "@/shared/relations.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  getLevelIdsFromOnward,
  loadFeatCustomizations,
} from "./helpers.ts";

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
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

  const allCharacterLevels = await CharacterLevels.findMany(db, { characterId });
  const excludeIds = excludeCharacterLevelId ? [excludeCharacterLevelId] : [];

  // In edit mode the projected replacement must inherit the original level's
  // createdAt. Otherwise the projected row sorts last by createdAt and can
  // shift "first character level" status off this level — dropping the x4
  // first-level multiplier and silently undercounting the skill budget.
  // The id stays a fresh uuid so the DataLoader join doesn't double-count
  // auto-granted feats from the excluded DB row.
  const editedLevel = excludeCharacterLevelId
    ? allCharacterLevels.find((l) => l.id === excludeCharacterLevelId)
    : undefined;
  const projectedReplacement = editedLevel
    ? { ...buildProjectedCharacterLevel(characterId, klassLevel.id, abilityId), createdAt: editedLevel.createdAt }
    : buildProjectedCharacterLevel(characterId, klassLevel.id, abilityId);

  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
    : [];
  const projectedData: Dnd35ProjectedCharacterData = {
    ...(excludeIds.length > 0 && { excludeCharacterLevelIds: excludeIds }),
    characterLevels: [...pendingLevels, projectedReplacement],
  };

  // Build detailed character with projected data
  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(undefined, projectedData);

  // Get skill points breakdown from the level-up projector
  const levelUpProjector = rulesetModule.createLevelUpProjector(detailedCharacter) as Dnd35LevelUpProjector;
  const skillsBreakdown = levelUpProjector.getSkillBudget();
  const availableSkillPoints = skillsBreakdown.available;

  // Get class skills for the current klass being leveled
  const klassSkillRecords = rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [];
  const currentClassSkillIds = new Set(klassSkillRecords.map((ks) => ks.skillId));
  // Collect class skill names so subtypes (e.g. "Craft (Alchemy)" when "Craft" is
  // a class skill) are also treated as current class skills, mirroring
  // DetailedCharacterSkills.initialize().
  const currentClassSkillNames = new Set(
    klassSkillRecords.map((ks) => ks.skillsInRule.name),
  );

  // All skills for the ruleset — from composed cache.
  const allSkills = rulesetData.skills;

  // Also mark subtypes of class skills as current class skills
  for (const skill of allSkills) {
    if (
      !currentClassSkillIds.has(skill.id) &&
      [...currentClassSkillNames].some((name) => skill.name.startsWith(`${name} (`))
    ) {
      currentClassSkillIds.add(skill.id);
    }
  }

  // Map skills with class info and current ranks from character skills.
  // isClassSkill = class skill for ANY of the character's classes (for max rank).
  // isCurrentClassSkill = class skill for the class being leveled (for cost).
  const skillsWithClassInfo = levelUpProjector.getCharacterEnrichedSkills(allSkills, currentClassSkillIds);

  // Total character level after the projected change. Used client-side for
  // the 3.5 rank cap (`totalCharacterLevel + 3` for class skills,
  // `(totalCharacterLevel + 3) / 2` for cross-class). Edit mode excludes
  // only the edited level itself, so the count still equals the total.
  let totalCharacterLevel: number;
  if (excludeIds.length > 0) {
    totalCharacterLevel = allCharacterLevels.length - excludeIds.length + 1;
  } else {
    totalCharacterLevel = allCharacterLevels.length + 1;
  }

  return {
    skillPointsToSpend: Math.max(1, availableSkillPoints),
    totalCharacterLevel,
    skills: skillsWithClassInfo,
  };
  });
}

export async function getFeatSlots(session: Session, characterId: string, klassId: string, level: number, pendingLevelKlassLevelIds?: string[]) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

  const allAutoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];
  const autoGrantedCustomizations = loadFeatCustomizations(rulesetData, allAutoGrantedRecords.map((rec) => rec.featsInRule.id));

  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds)
    : [];
  const projectedCharacterLevel = buildProjectedCharacterLevel(characterId, klassLevel.id);
  const projectedData: Dnd35ProjectedCharacterData = {
    characterLevels: [...pendingLevels, projectedCharacterLevel],
    givenFeats: buildProjectedGivenFeats(allAutoGrantedRecords, projectedCharacterLevel.id, autoGrantedCustomizations),
  };

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(undefined, projectedData);

  const aptitudesInstance = detailedCharacter.getDetailedCharacterAptitudes();

  const aptitudePools = aptitudesInstance.extractFeatPools();
  const nonLeveledAptitudeIds = aptitudesInstance.getNonLeveledAptitudeIds();
  const sharedAptitudeIds = new Set(
    nonLeveledAptitudeIds.filter((id) => rulesetData.aptitudeIdsByHavingPowers.has(id)),
  );
  let featsToSelect = 0;
  for (const pool of Object.values(aptitudePools)) {
    pool.shared = sharedAptitudeIds.has(pool.id);
    if (!pool.shared) {
      featsToSelect += pool.available;
    }
  }

  const autoGrantedFeats = allAutoGrantedRecords.map((rec) => rec.featsInRule);

  return {
    featsToSelect,
    autoGrantedFeats,
    aptitudePools,
  };
  });
}

export async function getEditFeatSlots(session: Session, characterId: string, klassId: string, level: number, characterLevelId: string) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

  const editAutoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];
  const editAutoGrantedCustomizations = loadFeatCustomizations(rulesetData, editAutoGrantedRecords.map((rec) => rec.featsInRule.id));

  // Exclude only this level: must match updateLevel's projection so dialog
  // pool counts agree with what validate() sees on save. Inherit the edited
  // level's createdAt (but keep a fresh uuid for the projected id) so
  // "first character level" status doesn't migrate off this level — see
  // getSkillSlots above.
  const editedLevel = await CharacterLevels.findOne(db, { id: characterLevelId });
  if (!editedLevel) {
    throw new NotFoundError("Character level not found");
  }
  const projectedCharacterLevel = {
    ...buildProjectedCharacterLevel(characterId, klassLevel.id),
    createdAt: editedLevel.createdAt,
  };
  const projectedData: Dnd35ProjectedCharacterData = {
    excludeCharacterLevelIds: [characterLevelId],
    characterLevels: [projectedCharacterLevel],
    givenFeats: buildProjectedGivenFeats(editAutoGrantedRecords, projectedCharacterLevel.id, editAutoGrantedCustomizations),
  };

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  const preloaded = await detailedCharacter.preload();
  await detailedCharacter.build(undefined, projectedData, preloaded);

  const aptitudesInstance = detailedCharacter.getDetailedCharacterAptitudes();
  const aptitudePools = aptitudesInstance.extractFeatPools();

  const nonLeveledAptitudeIds = Object.keys(aptitudePools);
  const sharedAptitudeIds = new Set(
    nonLeveledAptitudeIds.filter((id) => rulesetData.aptitudeIdsByHavingPowers.has(id)),
  );
  let featsToSelect = 0;
  for (const pool of Object.values(aptitudePools)) {
    pool.shared = sharedAptitudeIds.has(pool.id);
    if (!pool.shared) {
      featsToSelect += pool.available;
    }
  }

  const allAutoGrantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevel.id) ?? [];
  const autoGrantedFeats = allAutoGrantedRecords.map((rec) => rec.featsInRule);

  return {
    featsToSelect,
    autoGrantedFeats,
    aptitudePools,
  };
  });
}

export async function getPowerSlots(session: Session, characterId: string, klassId: string, level: number, pendingLevelKlassLevelIds?: string[]) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds)
    : [];
  const projectedData: Dnd35ProjectedCharacterData = {
    characterLevels: [...pendingLevels, buildProjectedCharacterLevel(characterId, klassLevel.id)],
  };

  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(undefined, projectedData);

  const aptitudesInstance = detailedCharacter.getDetailedCharacterAptitudes();

  const aptitudePools = aptitudesInstance.extractPowerPools();
  // Drop non-leveled aptitudes that aren't linked to any power — those are
  // feat-only pools (e.g. "Bonus Arcane Caster Level") and don't belong in the
  // spells step. Mirrors the filter applied in the batch-add preview.
  for (const aptId of aptitudesInstance.getNonLeveledAptitudeIds()) {
    if (!rulesetData.aptitudeIdsByHavingPowers.has(aptId)) {
      delete aptitudePools[aptId];
    }
  }
  let powersToSelect = 0;
  for (const pool of Object.values(aptitudePools)) {
    powersToSelect += pool.available;
  }

  const autoGrantedPowersRecords = rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];
  const autoGrantedPowers = autoGrantedPowersRecords.map((rec) => ({
    ...rec.powersInRule,
    free: rec.free,
  }));

  return {
    powersToSelect,
    autoGrantedPowers,
    aptitudePools,
  };
  });
}

export async function getAttributeSlots(session: Session, characterId: string, excludeCharacterLevelId?: string, pendingLevelCount?: number) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });

  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  const rulesetModule = await RulesetFactory.fromRulesetId(characterRecord.rulesetId);
  const characterLevels = await CharacterLevels.findMany(db, { characterId });
  const excludeIds = excludeCharacterLevelId
    ? getLevelIdsFromOnward(characterLevels, excludeCharacterLevelId)
    : [];
  // totalLevel = number of levels before this one (so totalLevel+1 = the level being added/edited)
  const totalLevel = characterLevels.length - excludeIds.length + (pendingLevelCount ?? 0);

  if (!rulesetModule.hooks.levels.isAbilityIncreaseLevel(totalLevel)) {
    return {
      isAvailable: false,
      attributes: {},
    };
  }

  const projectedData: Dnd35ProjectedCharacterData | undefined = excludeIds.length > 0
    ? { excludeCharacterLevelIds: excludeIds }
    : undefined;

  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(undefined, projectedData);
  const abilities = detailedCharacter.getDetailedCharacterAbilities();

  return {
    isAvailable: true,
    attributes: abilities.getAbilitiesWithIds(),
  };
}

export async function getEditPowerSlots(session: Session, characterId: string, klassId: string, level: number, characterLevelId: string) {
  const characterRecord = await Characters.findOneEditable(db, {
    id: characterId,
    userId: session.userId,
  });
  if (!characterRecord) {
    throw new NotFoundError("Character not found");
  }

  return await withRulesetScope(db, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {

    const klassLevel = rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) {
      throw new NotFoundError("Class level not found");
    }

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);

  // Exclude only this level: matches updateLevel's projection (see getEditFeatSlots).
  // Inherit the edited level's createdAt so "first character level" status
  // doesn't migrate off this level. Id stays a fresh uuid.
  const editedLevel = await CharacterLevels.findOne(db, { id: characterLevelId });
  if (!editedLevel) {
    throw new NotFoundError("Character level not found");
  }
  const projectedData: Dnd35ProjectedCharacterData = {
    excludeCharacterLevelIds: [characterLevelId],
    characterLevels: [
      { ...buildProjectedCharacterLevel(characterId, klassLevel.id), createdAt: editedLevel.createdAt },
    ],
  };

  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  const preloaded = await detailedCharacter.preload();
  await detailedCharacter.build(undefined, projectedData, preloaded);

  const aptitudesInstance = detailedCharacter.getDetailedCharacterAptitudes();
  const aptitudePools = aptitudesInstance.extractPowerPools();
  // Drop non-leveled aptitudes that aren't linked to any power — those are
  // feat-only pools (e.g. "Bonus Arcane Caster Level") and don't belong in the
  // spells step. Mirrors the filter applied in the batch-add preview.
  for (const aptId of aptitudesInstance.getNonLeveledAptitudeIds()) {
    if (!rulesetData.aptitudeIdsByHavingPowers.has(aptId)) {
      delete aptitudePools[aptId];
    }
  }

  let powersToSelect = 0;
  for (const pool of Object.values(aptitudePools)) {
    powersToSelect += pool.available;
  }

  const autoGrantedPowersRecords = rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevel.id) ?? [];
  const autoGrantedPowers = autoGrantedPowersRecords.map((rec) => ({
    ...rec.powersInRule,
    free: rec.free,
  }));

  return {
    powersToSelect,
    autoGrantedPowers,
    aptitudePools,
  };
  });
}
