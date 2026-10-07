import type { RulesetData } from "@/engine/core/view/index.ts";
import type Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import Dnd35LevelUpProjector from "@/engine/rulesets/dnd3.5/character/Dnd35LevelUpProjector.ts";
import { Dnd35LevelsRules } from "@/engine/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import type { Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";

import { getClassSkillIds } from "./classes.ts";
import {
  buildPendingCharacterLevels,
  buildProjectedCharacterLevel,
  buildProjectedGivenFeats,
  getLevelIdsFromOnward,
  loadFeatCustomizations,
} from "./projection.ts";

/**
 * What a level-up step projects: a new level after the levels planned before it (`pendingLevel…`), or an edit of one
 * of the character's (`editedLevel`), which the projected level replaces.
 */
export interface StepProjection {
  /** The projected level's ability increase. */
  abilityId?: string;
  /** The level edited: the projected level takes its place, so the first level stays the first (its x4 skill points). */
  editedLevel?: { id: string; position: number };
  pendingLevelAbilityIds?: (string | undefined)[];
  pendingLevelKlassLevelIds?: string[];
}

/**
 * The step's projected level of class level `klassLevelId`, and the projection it goes in: after the pending levels,
 * or in place of the edited one. Its id is fresh, so the loader doesn't count the stored level's granted feats twice.
 */
function projectStep(characterId: string, klassLevelId: string, projection: StepProjection) {
  const { editedLevel, abilityId, pendingLevelKlassLevelIds, pendingLevelAbilityIds } = projection;
  const pendingLevels = pendingLevelKlassLevelIds?.length
    ? buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
    : [];
  const projected = buildProjectedCharacterLevel(characterId, klassLevelId, abilityId);
  const level = editedLevel ? { ...projected, position: editedLevel.position } : projected;
  const data: Dnd35ProjectedCharacterData = {
    ...(editedLevel && { excludeCharacterLevelIds: [editedLevel.id] }),
    characterLevels: [...pendingLevels, level],
  };
  return { level, data };
}

/** The feats step: the feat pools of the character built with the step, and the feats its class level grants. */
export function buildFeatSlots(character: Dnd35DetailedCharacter, klassLevelId: string, rulesetData: RulesetData) {
  const { featPools: aptitudePools, featsToSelect } = character.components.aptitudes.getLevelUpPools(rulesetData);
  return {
    featsToSelect,
    autoGrantedFeats: (rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevelId) ?? []).map(
      (rec) => rec.featsInRule,
    ),
    aptitudePools,
  };
}

/** The powers step: the power pools of the character built with the step, and the powers its class level grants. */
export function buildPowerSlots(character: Dnd35DetailedCharacter, klassLevelId: string, rulesetData: RulesetData) {
  const { powerPools: aptitudePools, powersToSelect } = character.components.aptitudes.getLevelUpPools(rulesetData);
  const autoGrantedPowers = (rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? []).map((rec) => ({
    ...rec.powersInRule,
    free: rec.free,
  }));
  return { powersToSelect, autoGrantedPowers, aptitudePools };
}

/**
 * The skills step: the points to spend, and each skill with its class status. A skill's class status is any of the
 * character's classes' (its max rank, `isClassSkill`) and the leveled class's (its cost, `isCurrentClassSkill`). The
 * client caps a rank by the character's total level after the step (`totalCharacterLevel`).
 */
export function buildSkillSlots(
  character: Dnd35DetailedCharacter,
  klassId: string,
  totalCharacterLevel: number,
  rulesetData: RulesetData,
) {
  const projector = new Dnd35LevelUpProjector(character);
  const currentClassSkillIds = getClassSkillIds(
    rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [],
    rulesetData.skills,
  );
  return {
    skillPointsToSpend: Math.max(1, projector.getSkillBudget().available),
    totalCharacterLevel,
    skills: projector.getCharacterEnrichedSkills(rulesetData.skills, currentClassSkillIds),
  };
}

/**
 * The attributes step's character, built without the edited level and those after it: `undefined` when the level
 * takes no ability increase, after the character's `levels` but those, and the pending ones.
 */
export function projectAttributeStep(
  levels: { id: string; position: number }[],
  excludeCharacterLevelId?: string,
  pendingLevelCount?: number,
): { projected?: Dnd35ProjectedCharacterData } | undefined {
  const excludeIds = excludeCharacterLevelId ? getLevelIdsFromOnward(levels, excludeCharacterLevelId) : [];
  // The levels before this one: the level added or edited is the next
  const totalLevel = levels.length - excludeIds.length + (pendingLevelCount ?? 0);
  if (!Dnd35LevelsRules.isAbilityIncreaseLevel(totalLevel)) return undefined;
  return excludeIds.length > 0 ? { projected: { excludeCharacterLevelIds: excludeIds } } : {};
}

/** The feats step's projection: the step's, with the feats its class level grants. */
export function projectFeatStep(
  characterId: string,
  klassLevelId: string,
  projection: StepProjection,
  rulesetData: RulesetData,
): Dnd35ProjectedCharacterData {
  const grantedRecords = rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevelId) ?? [];
  const customizations = loadFeatCustomizations(
    rulesetData,
    grantedRecords.map((rec) => rec.featsInRule.id),
  );
  const { level, data } = projectStep(characterId, klassLevelId, projection);
  return { ...data, givenFeats: buildProjectedGivenFeats(grantedRecords, level.id, customizations) };
}

/** The powers and skills steps' projection: the step's level alone. */
export function projectStepLevel(characterId: string, klassLevelId: string, projection: StepProjection) {
  return projectStep(characterId, klassLevelId, projection).data;
}
