import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd5/rules/LevelRules.ts";

import CharacterProjection from "./CharacterProjection.ts";
import LevelUpState, { type PoolPicks } from "./LevelUpState.ts";
import type { LevelQuery } from "./requests.ts";

/**
 * The step's level built with the feats and spells that fit at it (`LevelUpSteps.buildPicked`): the character, its class
 * level, whether it's the character's first, what fits, and its pools.
 */
type Picked = ReturnType<LevelUpSteps["buildPicked"]>;

/**
 * The level-up wizard's steps for a character, from its rows, in their order: its feat and spell pools, each for the
 * character built with the step's level.
 */
export default class LevelUpSteps extends LevelUpState {
  /**
   * The step's level built with the feats and spells picked at it (`step.picks`), fitted to their pools as a save would
   * take them (an edited level keeping its own saved feats and spells): the character with what fits, what fits, its
   * class level, and whether it's the character's first level (an edit of its first, or the first a level-up adds).
   */
  private buildPicked(step: LevelQuery) {
    const classLevel = this.readClassLevel(step);
    const fitted = this.fitPicks(
      step.picks ?? {},
      (picks) => this.build(this.projectStep(classLevel.id, step, picks)),
      this.getSavedPicks(step.editedLevel?.id),
    );
    const pools = fitted.character.components.aptitudes.getLevelUpPools(this.dnd5, this.countOwnPicks(fitted.picks));
    const first = step.editedLevel
      ? this.isFirstSaved(step.editedLevel)
      : this.character.rows.advancements.length + (step.planned?.classLevelIds?.length ?? 0) === 0;
    return { character: fitted.character, classLevel, first, picks: fitted.picks, pools };
  }

  /**
   * What the step's level gives through a modifier (`givenWith`), with its fitted picks (`picks`): an edited level's,
   * as it was taken (the character before it, then with it alone after that, as its issues read it); a level-up's
   * with the levels the plan takes before it.
   */
  private givenAt(step: LevelQuery, classLevelId: string, picks: PoolPicks) {
    if (step.editedLevel) {
      const { before, withLevel } = this.projectLevelContribution(step.editedLevel.id, classLevelId, picks);
      return this.givenWith(this.build(before), this.build(withLevel));
    }
    const before = new CharacterProjection(this.character);
    before.addLevels(step.planned?.classLevelIds ?? [], { hp: LevelRules.UNROLLED_LEVEL_HP });
    return this.givenWith(this.build(before), this.build(this.projectStep(classLevelId, step, picks)));
  }

  /**
   * The step's projection: a level of class level `classLevelId` after the levels planned before it, or in the edited
   * level's place, so the first level stays the first, with the feats and spells it picks (`picks`), when given.
   */
  private projectStep(classLevelId: string, step: LevelQuery, picks?: PoolPicks) {
    const projection = new CharacterProjection(this.character);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(step.planned?.classLevelIds ?? [], { hp });
    const level = projection.addLevel(classLevelId, { hp, replacing: step.editedLevel });
    if (picks) projection.pick(level, this.toPickPlans(picks));
    return projection;
  }

  /** The class level the step's level is: refused when the step names no class or level, or the class has no such level. */
  private readClassLevel({ classId, level }: LevelQuery) {
    if (!classId || level === undefined) throw new RulesError("invalid", "The step's class and level are required");
    return this.getClassLevel(classId, level);
  }

  /**
   * Every step of the step's level, by its name: its feats and its spells, over the level built once with its feats and
   * spells, each with its pools, what fits, and its grants (a class's first level's starting proficiencies among them).
   */
  describeLevelSteps(step: LevelQuery) {
    const { classLevel, first, picks, pools }: Picked = this.buildPicked(step);
    const levels = [{ classLevelId: classLevel.id, first }];
    const given = this.givenAt(step, classLevel.id, picks);
    return {
      feats: { ...this.featStep(pools, levels, given.feats), fitted: picks.feats },
      spells: { ...this.spellStep(pools, [classLevel.id], given.spells), fitted: picks.spells },
    };
  }
}
