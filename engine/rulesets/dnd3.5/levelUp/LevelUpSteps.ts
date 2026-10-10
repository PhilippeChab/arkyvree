import { CharacterProjection, type LevelQuery } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import LevelUpState, { type PoolPicks } from "./LevelUpState.ts";

/**
 * What a level-up step projects: a new level after the levels planned before it (`pendingLevel…`), or an edit of one
 * of the character's (`editedLevel`), which the projected level replaces.
 */
type StepProjection = Omit<LevelQuery, "editedLevelId"> & {
  /** The level edited: the projected level takes its place, so the first level stays the first (its x4 skill points). */
  editedLevel?: { id: string; position: number };
};

/** The steps a 3.5 level has, in the wizard's order: each by its name, which `describeStep` answers it by. */
const STEPS = [
  { name: "abilities", label: "Ability Increase" },
  { name: "skills", label: "Select Skills" },
  { name: "feats", label: "Select Feats" },
  { name: "powers", label: "Select Spells" },
] as const;

/**
 * The level-up wizard's steps for a character, from its rows, in their order: its ability increase, its skill points,
 * and its feat and power pools, each for the character built with the step's level.
 */
export default class LevelUpSteps extends LevelUpState {
  /**
   * The step's level built with the feats and powers picked at it (`step.picks`), fitted to their pools as a save would
   * take them: the character with what fits, what fits, and its class level.
   */
  private buildPicked(step: LevelQuery) {
    const klassLevel = this.readKlassLevel(step);
    const projected = this.readStep(step);
    const fitted = this.fitPicks(step.picks ?? {}, (picks) =>
      this.build(this.projectStep(klassLevel.id, projected, picks)),
    );
    const pools = fitted.character.components.aptitudes.getLevelUpPools(
      this.rulesetData,
      this.countOwnPicks(fitted.picks),
    );
    return { klassLevel, picks: fitted.picks, pools };
  }

  /**
   * The attributes step: the character's abilities, when the level it adds or edits takes an ability increase, after
   * its levels but the edited one and those after it, and the levels planned before it, which it's built with; and
   * whether its pick is made, which Next waits for: the level's increases (`step.abilityIncreases`) as its save checks
   * them, or nothing to pick at a level that takes none.
   */
  private describeAbilityStep(step: LevelQuery) {
    const { abilityIncreases = [], editedLevel, planned } = this.readStep(step);
    const projection = new CharacterProjection(this.character);
    if (editedLevel) projection.dropLevelsFrom(editedLevel.id);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(planned?.klassLevelIds ?? [], { abilityIncreases: planned?.abilityIncreases, hp });
    // The levels before this one: the level added or edited is the next
    const levelsBefore = projection.input.rows.levels.length;
    if (!LevelRules.isAbilityIncreaseLevel(levelsBefore)) return { isAvailable: false, attributes: {}, picked: true };
    return {
      isAvailable: true,
      attributes: this.build(projection).components.abilities.getAbilitiesWithIds(),
      picked: this.checks.areAbilityIncreasesPicked(levelsBefore, abilityIncreases),
    };
  }

  /**
   * The feats step of the step's level: the pools the character picks feats in with it, each with its room for the
   * feats picked at it (`step.picks`), what of them fits (`fitted`), and its grants.
   */
  private describeFeatStep(step: LevelQuery) {
    const { klassLevel, picks, pools } = this.buildPicked(step);
    return { ...this.featStep(pools, [klassLevel.id]), fitted: picks.feats };
  }

  /**
   * The powers step of the step's level: the pools the character picks powers in with it, each with its room for the
   * powers picked at it (`step.picks`), what of them fits (`fitted`), and its grants.
   */
  private describePowerStep(step: LevelQuery) {
    const { klassLevel, picks, pools } = this.buildPicked(step);
    return { ...this.powerStep(pools, [klassLevel.id]), fitted: picks.powers };
  }

  /**
   * The skills step of the step's level: the points to spend, each skill's class status and what the form's points
   * (`step.picks.skills`) come to at the level, and the levels the character has with it, the planned ones before it
   * too (an edit's level takes the edited one's place). The level's points are all the character has left to spend.
   */
  private describeSkillStep(step: LevelQuery) {
    const klassLevel = this.readKlassLevel(step);
    const projection = this.projectStep(klassLevel.id, this.readStep(step));
    const character = this.build(projection);
    // A skill's class status is any of the character's classes' (its max rank, `isClassSkill`) and the leveled class's
    // (its cost, `isCurrentClassSkill`)
    const classSkillIds = this.getClassSkillIds(
      this.rulesetData.klassSkillsWithSkillsByKlass.get(klassLevel.klassId) ?? [],
    );
    const levels = {
      perLevelClassSkillIds: [this.rulesetData.skills.filter(({ id }) => classSkillIds.has(id)).map(({ id }) => id)],
      perLevelSkillPoints: [this.getSkillPointsToSpend(character)],
      savedLevelCount: projection.input.rows.levels.length - 1,
    };
    return this.skillStep(character, classSkillIds, levels, step.picks?.skills ?? {});
  }

  /**
   * The step's projection: a level of class level `klassLevelId` after the levels planned before it, or in the edited
   * level's place, so the first level stays the first (its x4 skill points), with the feats and powers it picks
   * (`picks`), when given.
   */
  private projectStep(klassLevelId: string, step: StepProjection, picks?: PoolPicks) {
    const projection = new CharacterProjection(this.character);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(step.planned?.klassLevelIds ?? [], { abilityIncreases: step.planned?.abilityIncreases, hp });
    const replacing = step.editedLevel;
    const level = projection.addLevel(klassLevelId, { abilityIncreases: step.abilityIncreases, hp, replacing });
    if (picks) projection.pick(level, this.toPickRows({ ...picks, skills: {} }));
    return projection;
  }

  /** The class level the step's level is: refused when the step names no class or level, or the class has no such level. */
  private readKlassLevel({ klassId, level }: LevelQuery) {
    if (!klassId || level === undefined) throw new RulesError("invalid", "The step's class and level are required");
    return this.getKlassLevel(klassId, level);
  }

  /** The step's projection, the edited level's place read off the character's levels: refused when it has no such level. */
  private readStep({ editedLevelId, ...step }: LevelQuery): StepProjection {
    if (!editedLevelId) return step;
    const editedLevel = this.character.rows.levels.find((level) => level.id === editedLevelId);
    if (!editedLevel) throw new RulesError("not-found", "Character level not found");
    return { ...step, editedLevel };
  }

  /**
   * The wizard's step `name` of the step's level, named for which it is: refused when 3.5 has no such step, or when it
   * reads the level's class (its skills, feats and powers) and the step names none.
   */
  describeStep(name: string, step: LevelQuery) {
    switch (name) {
      case "abilities":
        return { name, ...this.describeAbilityStep(step) };
      case "feats":
        return { name, ...this.describeFeatStep(step) };
      case "powers":
        return { name, ...this.describePowerStep(step) };
      case "skills":
        return { name, ...this.describeSkillStep(step) };
      default:
        throw new RulesError("not-found", "Level step not found");
    }
  }

  /** The wizard's steps of a 3.5 level, in order: the same four for every level. */
  describeSteps() {
    return STEPS;
  }
}
