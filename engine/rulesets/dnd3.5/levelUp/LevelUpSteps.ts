import { CharacterProjection, type LevelStep } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

import LevelUpState from "./LevelUpState.ts";

/**
 * What a level-up step projects: a new level after the levels planned before it (`pendingLevel…`), or an edit of one
 * of the character's (`editedLevel`), which the projected level replaces.
 */
type StepProjection = Omit<LevelStep, "editedLevelId"> & {
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
   * The attributes step: the character's abilities, when the level it adds or edits takes an ability increase, after
   * its levels but the edited one and those after it, and the levels planned before it, which it's built with.
   */
  private describeAbilityStep(step: LevelStep) {
    const { editedLevel, planned } = this.readStep(step);
    const projection = new CharacterProjection(this.character);
    if (editedLevel) projection.dropLevelsFrom(editedLevel.id);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(planned?.klassLevelIds ?? [], { abilityIds: planned?.abilityIds, hp });
    // The levels before this one: the level added or edited is the next
    if (!LevelRules.isAbilityIncreaseLevel(projection.input.rows.levels.length))
      return { isAvailable: false, attributes: {} };
    return { isAvailable: true, attributes: this.build(projection).components.abilities.getAbilitiesWithIds() };
  }

  /** The feats step of the step's level: the pools the character picks feats in with it, and its grants. */
  private describeFeatStep(step: LevelStep) {
    const klassLevel = this.readKlassLevel(step);
    const character = this.build(this.projectStep(klassLevel.id, this.readStep(step)));
    return this.featStep(character.components.aptitudes.getLevelUpPools(this.rulesetData), [klassLevel.id]);
  }

  /** The powers step of the step's level: the pools the character picks powers in with it, and its grants. */
  private describePowerStep(step: LevelStep) {
    const klassLevel = this.readKlassLevel(step);
    const character = this.build(this.projectStep(klassLevel.id, this.readStep(step)));
    return this.powerStep(character.components.aptitudes.getLevelUpPools(this.rulesetData), [klassLevel.id]);
  }

  /**
   * The skills step of the step's level: the points to spend and each skill's class status. An edit replaces the edited
   * level, so the character's level count stays its total.
   */
  private describeSkillStep(step: LevelStep) {
    const klassLevel = this.readKlassLevel(step);
    const character = this.build(this.projectStep(klassLevel.id, this.readStep(step)));
    const totalCharacterLevel = this.character.rows.levels.length + (step.editedLevelId ? 0 : 1);
    // A skill's class status is any of the character's classes' (its max rank, `isClassSkill`) and the leveled class's
    // (its cost, `isCurrentClassSkill`)
    const classSkillIds = this.getClassSkillIds(
      this.rulesetData.klassSkillsWithSkillsByKlass.get(klassLevel.klassId) ?? [],
    );
    return this.skillStep(character, classSkillIds, totalCharacterLevel);
  }

  /**
   * The step's projection: a level of class level `klassLevelId` after the levels planned before it, or in the edited
   * level's place, so the first level stays the first (its x4 skill points).
   */
  private projectStep(klassLevelId: string, step: StepProjection) {
    const projection = new CharacterProjection(this.character);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    projection.addLevels(step.planned?.klassLevelIds ?? [], { abilityIds: step.planned?.abilityIds, hp });
    projection.addLevel(klassLevelId, { abilityId: step.abilityId, hp, replacing: step.editedLevel });
    return projection;
  }

  /** The class level the step's level is: refused when the step names no class or level, or the class has no such level. */
  private readKlassLevel({ klassId, level }: LevelStep) {
    if (!klassId || level === undefined) throw new RulesError("invalid", "The step's class and level are required");
    return this.getKlassLevel(klassId, level);
  }

  /** The step's projection, the edited level's place read off the character's levels: refused when it has no such level. */
  private readStep({ editedLevelId, ...step }: LevelStep): StepProjection {
    if (!editedLevelId) return step;
    const editedLevel = this.character.rows.levels.find((level) => level.id === editedLevelId);
    if (!editedLevel) throw new RulesError("not-found", "Character level not found");
    return { ...step, editedLevel };
  }

  /**
   * The wizard's step `name` of the step's level, named for which it is: refused when 3.5 has no such step, or when it
   * reads the level's class (its skills, feats and powers) and the step names none.
   */
  describeStep(name: string, step: LevelStep) {
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
