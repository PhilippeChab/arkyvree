import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { CLASS_HD } from "@/vocabulary/dnd3.5/fields/index.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

import type { PoolPicks } from "./LevelUpState.ts";
import PicksDistribution from "./PicksDistribution.ts";
import PlannedLevelsState, { type LevelGains, type PlannedLevels } from "./PlannedLevelsState.ts";
import type { LevelPicks, PreviewRequest } from "./requests.ts";

/** The level-up wizard's preview of the levels a character plans, from its rows: its steps, and each level's details. */
export default class LevelUpPreview extends PlannedLevelsState {
  /**
   * The level-up wizard's preview of the planned levels: its skills, feats, spells and attributes steps (whether every
   * level's ability increase is picked among them), each level's class, hit die and skill points, and where each pool's
   * next pick goes. The skills step spends the form's points (`picks.skills`, by skill, in its order) over the planned
   * levels, as their save spreads them; the feats and spells steps fit the form's feats and spells (`picks`) to their
   * pools, as a save would take them, and say what fits (`fitted`) and each pool's room for them.
   */
  private buildLevelUpPreview(planned: PlannedLevels, picks: Partial<LevelPicks>) {
    const { character, savedLevelCount, classLevelEntries } = planned;
    const gains = this.computeLevelGains(planned);
    const { classSkills, classLevelIds, perLevelSkillPoints } = gains;
    const levels = { perLevelClassSkillIds: classSkills.perLevel, perLevelSkillPoints, savedLevelCount };
    const fitted = this.fitPicks(picks, (poolPicks) => this.buildWithPicks(planned, poolPicks, gains));
    const pools = fitted.character.components.aptitudes.getLevelUpPools(this.dnd35, this.countOwnPicks(fitted.picks));
    return {
      skills: this.skillStep(character, classSkills.merged, levels, picks.skills ?? {}),
      feats: { ...this.featStep(pools, classLevelIds), fitted: fitted.picks.feats },
      spells: { ...this.spellStep(pools, classLevelIds), fitted: fitted.picks.spells },
      attributes: {
        abilityIncreaseLevels: this.getAbilityIncreaseLevels(savedLevelCount, classLevelEntries.length),
        attributes: character.components.abilities.getAbilitiesWithIds(),
        // Every planned level raises its abilities as its save checks them: the step's Next waits for it
        picked: classLevelEntries.every(({ abilityIncreases }, i) =>
          this.checks.areAbilityIncreasesPicked(savedLevelCount + i, abilityIncreases),
        ),
      },
      // Per-level data for HP step, review, and auto-assignment
      levelDetails: classLevelEntries.map(({ klass, classLevel }, i) => ({
        classId: klass.id,
        className: klass.name,
        classLevelId: classLevel.id,
        level: classLevel.position,
        hd: klass.fields[CLASS_HD],
        hitPoints: this.rules.hitPointsOf(klass.fields[CLASS_HD]),
        skillPoints: perLevelSkillPoints[i],
      })),
      nextPickLevels: this.nextPickLevelsOf(gains, fitted.picks),
      perLevelSkillPoints,
    };
  }

  /** The planned levels (by index) that take an ability increase, after the character's `savedLevelCount` levels. */
  private getAbilityIncreaseLevels(savedLevelCount: number, plannedCount: number) {
    const levelRules = LevelRules.of(this.view);
    const levels: number[] = [];
    for (let i = 0; i < plannedCount; i++) if (levelRules.isAbilityIncreaseLevel(savedLevelCount + i)) levels.push(i);
    return levels;
  }

  /**
   * The planned level each pool's next pick goes on (`PicksDistribution.nextLevelOf`), after the picks it has
   * (`picks`): a feat pool's, and a spell pool's at each spell level and at any (`""`), whichever the wizard opens.
   */
  private nextPickLevelsOf({ perLevelFeatSlots, perLevelSpellSlots }: LevelGains, picks: PoolPicks) {
    const own = this.countOwnPicks(picks);
    const feats = Object.entries(perLevelFeatSlots).map(([aptitudeId, slots]) => [
      aptitudeId,
      PicksDistribution.nextLevelOf(slots, own.feats[aptitudeId] ?? 0),
    ]);
    const spells = Object.entries(perLevelSpellSlots).map(([aptitudeId, slotsPerLevel]) => {
      const counts = own.spells[aptitudeId] ?? {};
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
      spells: Object.fromEntries(spells) as Record<string, Record<string, number>>,
    };
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`), each with its ability increases (raising
   * nothing at a level that takes none: the wizard's pick for a level the plan moved), and of the picks made over them so
   * far (`picks`: the skill points spent, by skill, in the form's order, and the feats and spells picked, by pool).
   */
  describePreview({ levels, picks = {} }: PreviewRequest) {
    const savedLevelCount = this.character.rows.advancements.length;
    const levelRules = LevelRules.of(this.view);
    const increased = levels.map((level, i) =>
      levelRules.isAbilityIncreaseLevel(savedLevelCount + i) ? level : { ...level, abilityIncreases: [] },
    );
    return this.buildLevelUpPreview(this.buildPlannedLevels(this.getPlannedClassLevels(increased)), picks);
  }
}
