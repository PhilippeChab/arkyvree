import { type Db } from "@/server/database/index.ts";
import {
  Feats,
} from "@/server/repositories/index.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import {
  KLASS_LEVEL_SKILL_POINTS,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { CharacterLevel, KlassLevel, Requirement } from "@/shared/relations.ts";
import type DetailedCharacter from "./DetailedCharacter.ts";
import type { Dnd35LevelUpProjector as Dnd35LevelUpProjectorInterface } from "./types.ts";

export default class Dnd35LevelUpProjector implements Dnd35LevelUpProjectorInterface {
  constructor(private readonly character: DetailedCharacter) {}

  async computeSkillPointsPerLevel(
    klassLevelIds: string[],
    existingLevelCount: number,
    rulesetData: CachedRulesetData,
  ): Promise<{ perLevel: number[]; abilityMod: number }> {
    const skillPointsByKlassLevelId = new Map<string, number>();
    for (const klassLevelId of klassLevelIds) {
      const props = rulesetData.propertiesByEntity.get(klassLevelId);
      if (!props) continue;
      for (const p of props) {
        if (p.entityType === "klass_levels" && p.type === KLASS_LEVEL_SKILL_POINTS) {
          skillPointsByKlassLevelId.set(p.entityId, Number(p.value));
          break;
        }
      }
    }

    const abilities = this.character.getDetailedCharacterAbilities();
    const abilityMod = abilities.getAbilityModifierExcludingMisc("intelligence");
    const bonusSkillPointsPerLevel = this.character.getDetailedCharacterSkills().getSkillBudget().perlevel;
    const hasExistingLevels = existingLevelCount > 0;

    const perLevel = klassLevelIds.map((klassLevelId, i) => {
      const sp = skillPointsByKlassLevelId.get(klassLevelId) ?? 0;
      const isFirstCharacterLevel = !hasExistingLevels && i === 0;
      const multiplier = isFirstCharacterLevel ? 4 : 1;
      return Math.max(1, (sp + abilityMod + bonusSkillPointsPerLevel) * multiplier);
    });

    return { perLevel, abilityMod };
  }

  async evaluateClassAvailability(
    candidates: { klassName: string; klassLevel: KlassLevel; requirementGroups: Requirement[][] }[],
    projectedCharacterLevel: CharacterLevel,
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    if (candidates.length === 0) return results;

    const identity = this.character.getDetailedCharacterIdentity().getIdentity();
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
    characterLevelIds: string[],
    klassLevelIds: string[],
    selectedFeatProperties: { type: string; value: string }[],
    clientExcludeSchools: string[],
    rulesetData: CachedRulesetData,
  ): Promise<string[]> {
    const aptitude = rulesetData.aptitudesById.get(aptitudeId);
    if (aptitude?.name !== "Wizard Spells") return [];

    const prohibitedSchools = new Set<string>(clientExcludeSchools);

    if (characterLevelIds.length > 0) {
      // Called inside withRulesetScope: Feats.findManyByCharacterLevelIds and
      // findManyByKlassLevelIds auto-apply resolveRowOverrides via the repo
      // Proxy, so feat.id is already post-COW. propertiesByEntity.get also
      // auto-resolves on the way in.
      const pickedFeats = await Feats.findManyByCharacterLevelIds(tx, { characterLevelIds });
      const givenFeats = await Feats.findManyByKlassLevelIds(tx, { klassLevelIds, characterLevelIds });
      const allFeatIds = [...new Set([...pickedFeats, ...givenFeats].map((f) => f.id))];

      for (const featId of allFeatIds) {
        const props = rulesetData.propertiesByEntity.get(featId);
        if (!props) continue;
        for (const p of props) {
          if (p.entityType === "feats" && p.type === WIZARD_PROHIBITED_SCHOOL) {
            prohibitedSchools.add(p.value);
          }
        }
      }
    }

    // Also check selected feats from the current session
    for (const prop of selectedFeatProperties) {
      if (prop.type === WIZARD_PROHIBITED_SCHOOL) {
        prohibitedSchools.add(prop.value);
      }
    }

    if (prohibitedSchools.size === 0) return [];

    // Look up power IDs by school via the reverse property index — O(k) instead
    // of O(P) where P is all composed powers.
    const excludedPowerIds = new Set<string>();
    for (const school of prohibitedSchools) {
      const ids = rulesetData.entityIdsByPropertyLookup.get(`powers:SPELL_SCHOOL:${school}`) ?? [];
      for (const id of ids) excludedPowerIds.add(id);
    }
    return [...excludedPowerIds];
  }

  getSkillBudget() {
    return this.character.getDetailedCharacterSkills().getSkillBudget();
  }

  getCharacterSkills(): Record<string, unknown> {
    return this.character.getDetailedCharacterSkills().getSkills();
  }

  getCharacterEnrichedSkills<T extends { id: string; name: string }>(
    allSkills: T[],
    classSkillIds: Set<string>,
  ): (T & { isClassSkill: boolean; isCurrentClassSkill: boolean; currentRank: number })[] {
    return this.character.getDetailedCharacterSkills().getEnrichedSkills(allSkills, classSkillIds);
  }
}
