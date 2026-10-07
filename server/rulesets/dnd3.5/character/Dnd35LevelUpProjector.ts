import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { type Db } from "@/server/database/index.ts";
import { Feats } from "@/server/repositories/index.ts";
import { readClassLevelFields } from "@/server/rulesets/dnd3.5/classes/classLevelFields.ts";
import type { Dnd35LevelUpProjector as Dnd35LevelUpProjectorInterface } from "@/server/rulesets/dnd3.5/types.ts";
import type { ProjectedCharacterLevel } from "@/server/rulesets/engine/types.ts";
import { SPELL_SCHOOL, WIZARD_PROHIBITED_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";
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

  getCharacterEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { currentRank: number; isClassSkill: boolean; isCurrentClassSkill: boolean })[] {
    return this.character.components.skills.getEnrichedSkills(allSkills, classSkillIds);
  }

  getCharacterSkills(): Record<string, unknown> {
    return this.character.components.skills.getSkills();
  }

  getSkillBudget() {
    return this.character.components.skills.getSkillBudget();
  }

  getSkillPointBases() {
    return this.character.components.skills.getSkillPointBases();
  }

  /** Each planned level's skill points, in the batch's order: the first counts four times over on a new character. */
  async computeSkillPointsPerLevel(
    klassLevelIds: string[],
    existingLevelCount: number,
    rulesetData: RulesetData,
  ): Promise<number[]> {
    const { bonusPerLevel } = this.getSkillPointBases();
    return this.computeSkillPointBasesPerLevel(klassLevelIds, rulesetData).map((points, i) =>
      computeLevelSkillPoints(points, bonusPerLevel, existingLevelCount === 0 && i === 0),
    );
  }

  async evaluateClassAvailability(
    candidates: { klassLevel: KlassLevel; klassName: string; requirementGroups: Requirement[][] }[],
    projectedCharacterLevel: ProjectedCharacterLevel,
  ): Promise<Map<string, boolean>> {
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

  async getExcludedPowerIds(
    tx: Db,
    aptitudeId: string,
    characterLevels: { id: string; klassLevelId: string }[],
    selectedFeatProperties: { type: string; value: string }[],
    clientExcludeSchools: string[],
    rulesetData: RulesetData,
  ): Promise<string[]> {
    const aptitude = rulesetData.aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set<string>(clientExcludeSchools);

    // Called inside withRulesetScope: Feats.findPicks and
    // Feats.findGrants auto-apply resolveRowOverrides via the repo
    // Proxy, so feat.id is already post-COW. propertiesByEntity.get also
    // auto-resolves on the way in.
    const characterLevelIds = characterLevels.map((level) => level.id);
    const pickedFeats = await Feats.findPicks(tx, { characterLevelIds });
    const givenFeats = await Feats.findGrants(tx, { levels: characterLevels });
    const allFeatIds = [...new Set([...pickedFeats, ...givenFeats].map((f) => f.id))];

    for (const featId of allFeatIds) {
      const props = rulesetData.propertiesByEntity.get(featId);
      if (!props) continue;
      for (const p of props)
        if (p.entityType === "feats" && p.type === WIZARD_PROHIBITED_SCHOOL) prohibitedSchools.add(p.value);
    }

    // Also check selected feats from the current session
    for (const prop of selectedFeatProperties)
      if (prop.type === WIZARD_PROHIBITED_SCHOOL) prohibitedSchools.add(prop.value);

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
}
