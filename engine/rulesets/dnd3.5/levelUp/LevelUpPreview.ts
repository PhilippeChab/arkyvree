import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import PlannedLevelsState, { type PlannedLevels } from "./PlannedLevelsState.ts";

/** The level-up wizard's preview of the levels a character plans, from its rows: its steps, and each level's details. */
export default class LevelUpPreview extends PlannedLevelsState {
  /**
   * The level-up wizard's preview of the planned levels: its skills, feats, powers and attributes steps, each level's
   * class, hit die and skill points, and what it recomputes the points and auto-assigns the picks by. The skills step's
   * points before the minimum are the planned levels' in the batch's order, and every level's in the budget's.
   */
  private buildLevelUpPreview(planned: PlannedLevels) {
    const { character, existingLevelCount, klassLevelEntries } = planned;
    const { classSkills, klassLevelIds, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints, pools } =
      this.computeLevelUpPlan(planned);
    return {
      skills: {
        ...this.skillStep(character, classSkills.merged, existingLevelCount + klassLevelEntries.length),
        ...character.components.skills.getSkillPointBases(),
      },
      feats: this.featStep(pools, klassLevelIds),
      powers: this.powerStep(pools, klassLevelIds),
      attributes: {
        abilityIncreaseLevels: this.getAbilityIncreaseLevels(existingLevelCount, klassLevelEntries.length),
        attributes: character.components.abilities.getAbilitiesWithIds(),
      },
      // Per-level data for HP step, review, and auto-assignment
      levelDetails: klassLevelEntries.map(({ klass, klassLevel }, i) => ({
        klassId: klass.id,
        klassName: klass.name,
        klassLevelId: klassLevel.id,
        level: klassLevel.level,
        hd: klass.hd,
        skillPoints: perLevelSkillPoints[i],
      })),
      perLevelSkillPoints,
      perLevelSkillPointBases: this.computeSkillPointBasesPerLevel(character, klassLevelIds),
      perLevelClassSkillIds: classSkills.perLevel,
      perLevelFeatSlots,
      perLevelPowerSlots,
    };
  }

  /** The planned levels (by index) that take an ability increase, after the character's `existingCount` levels. */
  private getAbilityIncreaseLevels(existingCount: number, plannedCount: number) {
    const levels: number[] = [];
    for (let i = 0; i < plannedCount; i++) if (LevelRules.isAbilityIncreaseLevel(existingCount + i)) levels.push(i);
    return levels;
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`, each with its ability increase in
   * `abilityIds`).
   */
  describePreview(levels: { klassId: string; level: number }[], abilityIds: (string | null)[]) {
    const klassLevelEntries = this.getPlannedKlassLevels(
      levels.map((level, i) => ({ ...level, abilityId: abilityIds[i] ?? null })),
    );
    return this.buildLevelUpPreview(this.buildPlannedLevels(klassLevelEntries));
  }
}
