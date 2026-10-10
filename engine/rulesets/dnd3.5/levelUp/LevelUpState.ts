import { LevelUpBase } from "@/engine/core/levelUp/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import SkillsComponent from "@/engine/rulesets/dnd3.5/model/skills/SkillsComponent.ts";

/** The pools a character picks feats and powers in, and how many, with what a level-up plans. */
type LevelUpPools = ReturnType<DetailedCharacter["components"]["aptitudes"]["getLevelUpPools"]>;

/**
 * What a 3.5 level-up flow reads past core's (`LevelUpBase`): the steps the wizard and the preview share, a feats step,
 * a powers step and a skills step, and which skills a class makes class skills.
 */
export default abstract class LevelUpState extends LevelUpBase<DetailedCharacter> {
  /**
   * A feats step, the wizard's and the preview's alike: how many feats the character picks with what's planned
   * (`pools`), in which pools, and the feats the class levels (`klassLevelIds`) grant.
   */
  protected featStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { klassLevelFeatsWithFeatsByKlassLevel } = this.rulesetData;
    return {
      featsToSelect: pools.featsToSelect,
      autoGrantedFeats: klassLevelIds.flatMap((id) =>
        (klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? []).map((rec) => rec.featsInRule),
      ),
      aptitudePools: pools.featPools,
    };
  }

  /** The skills class skill records make class skills: theirs, and the ruleset's subtypes of them ("Craft (…)" of Craft). */
  protected getClassSkillIds(records: { skillId: string; skillsInRule: { name: string } }[]): Set<string> {
    const ids = new Set(records.map((record) => record.skillId));
    const names = new Set(records.map((record) => record.skillsInRule.name));
    for (const skill of this.rulesetData.skills) if (SkillsComponent.isSubtypeOf(skill.name, names)) ids.add(skill.id);

    return ids;
  }

  /**
   * A powers step, the wizard's and the preview's alike: how many powers the character picks with what's planned
   * (`pools`), in which pools, and the powers the class levels (`klassLevelIds`) grant, each saying whether it's free.
   */
  protected powerStep(pools: LevelUpPools, klassLevelIds: string[]) {
    const { klassLevelPowersWithPowersByKlassLevel } = this.rulesetData;
    return {
      powersToSelect: pools.powersToSelect,
      autoGrantedPowers: klassLevelIds.flatMap((id) =>
        (klassLevelPowersWithPowersByKlassLevel.get(id) ?? []).map((rec) => ({ ...rec.powersInRule, free: rec.free })),
      ),
      aptitudePools: pools.powerPools,
    };
  }

  /**
   * A skills step, the wizard's and the preview's alike: the points the character has to spend (at least one), each
   * skill with its class status (`classSkillIds`), and the character's total level after the step, which caps a rank.
   */
  protected skillStep(character: DetailedCharacter, classSkillIds: Set<string>, totalCharacterLevel: number) {
    const { skills } = character.components;
    return {
      skillPointsToSpend: Math.max(1, skills.getSkillBudget().available),
      totalCharacterLevel,
      skills: skills.getEnrichedSkills(this.rulesetData.skills, classSkillIds),
    };
  }
}
