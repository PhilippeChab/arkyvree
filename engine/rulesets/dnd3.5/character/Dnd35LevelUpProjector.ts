import type { ProjectedCharacterLevel } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { readClassLevelFields } from "@/engine/rulesets/dnd3.5/classes/classLevelFields.ts";
import type { Dnd35LevelUpProjector as Dnd35LevelUpProjectorInterface } from "@/engine/rulesets/dnd3.5/types.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
import { computeLevelSkillPoints } from "@/shared/dnd3.5/skills.ts";
import type { KlassLevel, Requirement } from "@/shared/relations.ts";

import type DetailedCharacter from "./DetailedCharacter.ts";

export default class Dnd35LevelUpProjector implements Dnd35LevelUpProjectorInterface {
  constructor(private readonly character: DetailedCharacter) {}

  /**
   * Each planned level's points per level before the minimum, in the batch's order: its class's and the skill point
   * ability's modifier.
   */
  computeSkillPointBasesPerLevel(klassLevelIds: string[], rulesetData: RulesetData): number[] {
    const skills = this.character.components.skills;
    return klassLevelIds.map((klassLevelId) =>
      skills.getLevelPointsPerLevel(
        readClassLevelFields(rulesetData.propertiesByEntity.get(klassLevelId) ?? []).skills,
      ),
    );
  }

  /** Each planned level's skill points, in the batch's order: the first counts four times over on a new character. */
  computeSkillPointsPerLevel(klassLevelIds: string[], existingLevelCount: number, rulesetData: RulesetData): number[] {
    const { bonusPerLevel } = this.getSkillPointBases();
    return this.computeSkillPointBasesPerLevel(klassLevelIds, rulesetData).map((points, i) =>
      computeLevelSkillPoints(points, bonusPerLevel, existingLevelCount === 0 && i === 0),
    );
  }

  evaluateClassAvailability(
    candidates: { klassLevel: KlassLevel; klassName: string; requirementGroups: Requirement[][] }[],
    projectedCharacterLevel: ProjectedCharacterLevel,
  ): Map<string, boolean> {
    const results = new Map<string, boolean>();
    if (candidates.length === 0) return results;

    const identity = this.character.components.identity.getIdentity();
    identity.meta.level++;

    for (const candidate of candidates) {
      results.set(
        candidate.klassLevel.id,
        this.character.evaluateWithProjectedLevel(
          candidate.klassName,
          candidate.klassLevel,
          projectedCharacterLevel,
          candidate.requirementGroups,
        ),
      );
    }

    identity.meta.level--;
    return results;
  }

  getCharacterEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { currentRank: number; isClassSkill: boolean; isCurrentClassSkill: boolean })[] {
    return this.character.components.skills.getEnrichedSkills(allSkills, classSkillIds);
  }

  getCharacterSkills(): Record<string, unknown> {
    return this.character.components.skills.getSkills();
  }

  getExcludedPowerIds(aptitudeId: string, clientExcludeSchools: string[], rulesetData: RulesetData): string[] {
    const aptitude = rulesetData.aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set<string>(clientExcludeSchools);
    for (const school of this.character.getProhibitedSchools()) prohibitedSchools.add(school);

    if (prohibitedSchools.size === 0) return [];

    // Look up power IDs by school via the reverse property index — O(k) instead
    // of O(P) where P is all composed powers.
    const excludedPowerIds = new Set<string>();
    for (const school of prohibitedSchools) {
      const ids = rulesetData.entityIdsByPropertyLookup.get(`powers:${SPELL_SCHOOL}:${school}`) ?? [];
      for (const id of ids) excludedPowerIds.add(id);
    }
    return [...excludedPowerIds];
  }

  getSkillBudget() {
    return this.character.components.skills.getSkillBudget();
  }

  getSkillPointBases() {
    return this.character.components.skills.getSkillPointBases();
  }
}
