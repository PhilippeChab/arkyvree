import { SelectionChecks } from "@/engine/core/levelUp/index.ts";
import type { LevelPicks, LevelRequest } from "@/engine/core/module/index.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import PlannedLevelsState, { type PlannedLevels } from "./PlannedLevelsState.ts";

/** The level-up wizard's preview of the levels a character plans, from its rows: its steps, and each level's details. */
export default class LevelUpPreview extends PlannedLevelsState {
  /**
   * The level-up wizard's preview of the planned levels: its skills, feats, powers and attributes steps, each level's
   * class, hit die and skill points, and what it hands its picks out by. The skills step spends the form's points
   * (`points`, by skill, in its order) over the planned levels, as their save spreads them.
   */
  private buildLevelUpPreview(planned: PlannedLevels, points: Record<string, number>) {
    const { character, savedLevelCount, klassLevelEntries } = planned;
    const { classSkills, klassLevelIds, perLevelFeatSlots, perLevelPowerSlots, perLevelSkillPoints, pools } =
      this.computeLevelGains(planned);
    const levels = { perLevelClassSkillIds: classSkills.perLevel, perLevelSkillPoints, savedLevelCount };
    return {
      skills: this.skillStep(character, classSkills.merged, levels, points),
      feats: this.featStep(pools, klassLevelIds),
      powers: this.powerStep(pools, klassLevelIds),
      attributes: {
        abilityIncreaseLevels: this.getAbilityIncreaseLevels(savedLevelCount, klassLevelEntries.length),
        attributes: character.components.abilities.getAbilitiesWithIds(),
      },
      // Per-level data for HP step, review, and auto-assignment
      levelDetails: klassLevelEntries.map(({ klass, klassLevel }, i) => ({
        klassId: klass.id,
        klassName: klass.name,
        klassLevelId: klassLevel.id,
        level: klassLevel.level,
        hd: klass.hd,
        hitPoints: SelectionChecks.hitPointsOf(klass.hd),
        skillPoints: perLevelSkillPoints[i],
      })),
      perLevelSkillPoints,
      perLevelFeatSlots,
      perLevelPowerSlots,
    };
  }

  /** The planned levels (by index) that take an ability increase, after the character's `savedLevelCount` levels. */
  private getAbilityIncreaseLevels(savedLevelCount: number, plannedCount: number) {
    const levels: number[] = [];
    for (let i = 0; i < plannedCount; i++) if (LevelRules.isAbilityIncreaseLevel(savedLevelCount + i)) levels.push(i);
    return levels;
  }

  /**
   * The level-up wizard's preview of the levels the character plans, each with its ability increases (raising nothing
   * at a level that takes none: the wizard's pick for a level the plan moved), and of the picks made over them so far
   * (`picks`: the skill points spent, by skill, in the form's order).
   */
  describePreview(levels: Omit<LevelRequest, "hp">[], picks: Partial<LevelPicks> = {}) {
    const savedLevelCount = this.character.rows.levels.length;
    const increased = levels.map((level, i) =>
      LevelRules.isAbilityIncreaseLevel(savedLevelCount + i) ? level : { ...level, abilityIncreases: [] },
    );
    return this.buildLevelUpPreview(this.buildPlannedLevels(this.getPlannedKlassLevels(increased)), picks.skills ?? {});
  }
}
