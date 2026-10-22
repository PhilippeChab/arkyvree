import type { LevelChoicesQuery, LevelPickRows, LevelQuery } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type ClassPicker from "@/engine/rulesets/dnd3.5/pickers/ClassPicker.ts";
import FeatPicker from "@/engine/rulesets/dnd3.5/pickers/FeatPicker.ts";
import PowerPicker from "@/engine/rulesets/dnd3.5/pickers/PowerPicker.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import LevelUpSteps from "./LevelUpSteps.ts";

/** The feats and powers picked so far that fit in their pools, as a picker's query takes them. */
type PickedSoFar = Pick<LevelPickRows, "feats" | "powers">;

/** The feats and powers steps' answers, described together. */
type PickSteps = ReturnType<LevelUpSteps["describePickSteps"]>;

/** The level a step or a picker is for: the planned level's class and its next level. */
type PlannedStep = LevelQuery & { klassId: string; level: number };

/**
 * A character's choices at its next level, opened whole: the class picker, and for a planned level of the class the
 * query names, its four steps with the picks made so far, and a picker for each pool with room left, a feat pool's and
 * a power pool's at each spell level with room left, each checking its options against the character with the picks
 * that fit (the steps' `fitted`). What the wizard refuses to plan, it refuses.
 */
export default class LevelChoices extends LevelUpSteps {
  /** A feat picker for each feat pool with room left at the level, with the feats and powers that fit so far. */
  private openFeatPools(step: PlannedStep, feats: PickSteps["feats"], picks: PickedSoFar) {
    const pools = Object.values(feats.aptitudePools).filter(({ available }) => available > 0);
    return pools.map((pool) => ({
      picker: new FeatPicker(this.view, this.character, this.pickQuery(step, pool.id, picks)),
      pool: { id: pool.id, name: pool.name },
      room: pool.available,
      shared: pool.shared,
    }));
  }

  /**
   * A power picker for each power pool with room left at the level, at each of its spell levels with room left when it
   * counts them by level, with the feats and powers that fit so far.
   */
  private openPowerPools(step: PlannedStep, powers: PickSteps["powers"], picks: PickedSoFar) {
    const rooms = Object.values(powers.aptitudePools)
      .filter(({ available }) => available > 0)
      .flatMap((pool): { pool: typeof pool; powerLevel?: number; room: number }[] =>
        pool.leveled
          ? Object.entries(pool.levels ?? {})
              .filter(([, { available }]) => available > 0)
              .map(([powerLevel, { available }]) => ({ pool, powerLevel: Number(powerLevel), room: available }))
          : [{ pool, room: pool.available }],
      );
    // A power pool that doesn't count its powers by level is a shared one: a feat pool's room too
    return rooms.map(({ pool, powerLevel, room }) => ({
      picker: new PowerPicker(this.view, this.character, { ...this.pickQuery(step, pool.id, picks), powerLevel }),
      pool: { id: pool.id, name: pool.name },
      powerLevel,
      room,
      shared: !pool.leveled,
    }));
  }

  /** A pool's picker query at the level: the level's own, with the feats and powers that fit so far. */
  private pickQuery(step: PlannedStep, aptitudeId: string, picks: PickedSoFar) {
    return { ...step, aptitudeId, planned: { ...step.planned, featPicks: picks.feats, powerPicks: picks.powers } };
  }

  /**
   * The ability increases step of the level: refused when the query sends increases that can't be the level's, at a
   * level that takes none, past what it gives, or raising one twice, which the other steps and the pickers would build
   * the character with. Those picked so far may fall short of what it gives.
   */
  private readAbilityStep(step: PlannedStep) {
    // The levels before this one: the character's, none planned before it
    if (step.abilityIncreases?.length)
      this.checks.checkAbilityIncreasesSoFar(this.character.rows.levels.length, step.abilityIncreases);
    return this.describeAbilityStep(step);
  }

  /**
   * The class the query plans a level of, described by the class picker: refused when the character has no next level
   * of it, doesn't qualify for it, or has no level left.
   */
  private readPlannedKlass(picker: ClassPicker, klassId: string) {
    const klass = this.rulesetData.klassesById.get(klassId);
    const [option] = klass && klass.kind === picker.filters.kind ? picker.describe([klass]) : [];
    if (!option) throw new RulesError("not-found", "The character has no next level in this class");
    if (option.levelsLeft <= 0) throw new RulesError("unprocessable", "The character has no level left to take");
    if (!option.eligible)
      throw new RulesError("unprocessable", `The character doesn't meet ${option.name}'s requirements`);
    return option;
  }

  /**
   * The character's choices at its next level, for the class the query names, if it names one: the classes the
   * wizard's picker offers it (`classPicker`, nothing planned before the level).
   */
  openLevelChoices(query: LevelChoicesQuery, classPicker: ClassPicker) {
    const levelsLeft = LevelRules.countLevelsLeft(this.character.rows.levels.length);
    if (!query.klassId) return { classPicker, level: null, levelsLeft };

    const klass = this.readPlannedKlass(classPicker, query.klassId);
    const step = { ...query, klassId: klass.id, level: klass.nextLevel };
    const abilities = this.readAbilityStep(step);
    const skills = this.describeSkillStep(step);
    const { feats, powers } = this.describePickSteps(step);
    const { skills: _skills, ...picks } = this.toPickRows({ feats: feats.fitted, powers: powers.fitted, skills: {} });
    return {
      classPicker,
      levelsLeft,
      level: {
        featPools: this.openFeatPools(step, feats, picks),
        picked: picks,
        powerPools: this.openPowerPools(step, powers, picks),
        steps: {
          abilities,
          class: { id: klass.id, level: klass.nextLevel, name: klass.name },
          feats,
          powers,
          skills,
        },
      },
    };
  }
}
