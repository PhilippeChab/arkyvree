import { SelectionChecks } from "@/engine/core/levelUp/index.ts";
import type { LevelPicks, PreviewRequest } from "@/engine/core/module/index.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

import type { PoolPicks } from "./LevelUpState.ts";
import PicksDistribution from "./PicksDistribution.ts";
import PlannedLevelsState, { type LevelGains, type PlannedLevels } from "./PlannedLevelsState.ts";

/** The level-up wizard's preview of the levels a character plans, from its rows: its steps, and each level's details. */
export default class LevelUpPreview extends PlannedLevelsState {
  /**
   * The level-up wizard's preview of the planned levels: its skills, feats, powers and attributes steps, each level's
   * class, hit die and skill points, and where each pool's next pick goes. The skills step spends the form's points
   * (`picks.skills`, by skill, in its order) over the planned levels, as their save spreads them; the feats and powers
   * steps fit the form's feats and powers (`picks`) to their pools, as a save would take them, and say what fits
   * (`fitted`) and each pool's room for them.
   */
  private buildLevelUpPreview(planned: PlannedLevels, picks: Partial<LevelPicks>) {
    const { character, savedLevelCount, klassLevelEntries } = planned;
    const gains = this.computeLevelGains(planned);
    const { classSkills, klassLevelIds, perLevelSkillPoints } = gains;
    const levels = { perLevelClassSkillIds: classSkills.perLevel, perLevelSkillPoints, savedLevelCount };
    const fitted = this.fitPicks(picks, (poolPicks) => this.buildWithPicks(planned, poolPicks, gains));
    const pools = fitted.character.components.aptitudes.getLevelUpPools(
      this.rulesetData,
      this.countOwnPicks(fitted.picks),
    );
    return {
      skills: this.skillStep(character, classSkills.merged, levels, picks.skills ?? {}),
      feats: { ...this.featStep(pools, klassLevelIds), fitted: fitted.picks.feats },
      powers: { ...this.powerStep(pools, klassLevelIds), fitted: fitted.picks.powers },
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
      nextPickLevels: this.nextPickLevelsOf(gains, fitted.picks),
      perLevelSkillPoints,
    };
  }

  /** The planned levels (by index) that take an ability increase, after the character's `savedLevelCount` levels. */
  private getAbilityIncreaseLevels(savedLevelCount: number, plannedCount: number) {
    const levels: number[] = [];
    for (let i = 0; i < plannedCount; i++) if (LevelRules.isAbilityIncreaseLevel(savedLevelCount + i)) levels.push(i);
    return levels;
  }

  /**
   * The planned level each pool's next pick goes on (`PicksDistribution.nextLevelOf`), after the picks it has
   * (`picks`): a feat pool's, and a power pool's at each spell level and at any (`""`), whichever the wizard opens.
   */
  private nextPickLevelsOf({ perLevelFeatSlots, perLevelPowerSlots }: LevelGains, picks: PoolPicks) {
    const own = this.countOwnPicks(picks);
    const feats = Object.entries(perLevelFeatSlots).map(([aptitudeId, slots]) => [
      aptitudeId,
      PicksDistribution.nextLevelOf(slots, own.feats[aptitudeId] ?? 0),
    ]);
    const powers = Object.entries(perLevelPowerSlots).map(([aptitudeId, slotsPerLevel]) => {
      const counts = own.powers[aptitudeId] ?? {};
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const levels: Record<string, number> = {
        "": PicksDistribution.nextLevelOf(
          slotsPerLevel.map((slots) => Object.values(slots).reduce((sum, count) => sum + count, 0)),
          total,
        ),
      };
      for (let spellLevel = 0; spellLevel <= MAX_SPELL_LEVEL; spellLevel++) {
        const key = String(spellLevel);
        levels[key] = PicksDistribution.nextLevelOf(
          slotsPerLevel.map((slots) => slots[key] ?? 0),
          counts[key] ?? 0,
        );
      }
      return [aptitudeId, levels];
    });
    return {
      feats: Object.fromEntries(feats) as Record<string, number>,
      powers: Object.fromEntries(powers) as Record<string, Record<string, number>>,
    };
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`), each with its ability increases (raising
   * nothing at a level that takes none: the wizard's pick for a level the plan moved), and of the picks made over them so
   * far (`picks`: the skill points spent, by skill, in the form's order, and the feats and powers picked, by pool).
   */
  describePreview({ levels, picks = {} }: PreviewRequest) {
    const savedLevelCount = this.character.rows.levels.length;
    const increased = levels.map((level, i) =>
      LevelRules.isAbilityIncreaseLevel(savedLevelCount + i) ? level : { ...level, abilityIncreases: [] },
    );
    return this.buildLevelUpPreview(this.buildPlannedLevels(this.getPlannedKlassLevels(increased)), picks);
  }
}
