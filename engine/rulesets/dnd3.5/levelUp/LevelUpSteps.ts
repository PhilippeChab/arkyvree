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

/**
 * The level-up wizard's steps for a character, from its rows: its ability increase, its feat and power pools, and its
 * skill points, each for the character built with the step's level.
 */
export default class LevelUpSteps extends LevelUpState {
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

  /** The step's projection, the edited level's place read off the character's levels: refused when it has no such level. */
  private readStep({ editedLevelId, ...step }: LevelStep): StepProjection {
    if (!editedLevelId) return step;
    const editedLevel = this.character.rows.levels.find((level) => level.id === editedLevelId);
    if (!editedLevel) throw new RulesError("not-found", "Character level not found");
    return { ...step, editedLevel };
  }

  /**
   * The attributes step: the character's abilities, when the level it adds or edits takes an ability increase (after its
   * levels but the edited one and those after it, and the `pendingLevelCount` levels planned before it), built without
   * the edited level and those after it.
   */
  describeAbilityStep(excludeCharacterLevelId?: string, pendingLevelCount?: number) {
    const projection = new CharacterProjection(this.character);
    const dropped = excludeCharacterLevelId ? projection.dropLevelsFrom(excludeCharacterLevelId) : [];
    // The levels before this one: the level added or edited is the next
    const totalLevel = this.character.rows.levels.length - dropped.length + (pendingLevelCount ?? 0);
    if (!LevelRules.isAbilityIncreaseLevel(totalLevel)) return { isAvailable: false, attributes: {} };
    return { isAvailable: true, attributes: this.build(projection).components.abilities.getAbilitiesWithIds() };
  }

  /** The feats step of class `klassId`'s `level`: the pools the character picks feats in with it, and its grants. */
  describeFeatStep(klassId: string, level: number, step: LevelStep) {
    const klassLevel = this.getKlassLevel(klassId, level);
    const character = this.build(this.projectStep(klassLevel.id, this.readStep(step)));
    return this.featStep(character.components.aptitudes.getLevelUpPools(this.rulesetData), [klassLevel.id]);
  }

  /** The powers step of class `klassId`'s `level`: the pools the character picks powers in with it, and its grants. */
  describePowerStep(klassId: string, level: number, step: LevelStep) {
    const klassLevel = this.getKlassLevel(klassId, level);
    const character = this.build(this.projectStep(klassLevel.id, this.readStep(step)));
    return this.powerStep(character.components.aptitudes.getLevelUpPools(this.rulesetData), [klassLevel.id]);
  }

  /**
   * The skills step of class `klassId`'s `level`: the points to spend and each skill's class status. An edit replaces
   * the edited level, so the character's level count stays its total.
   */
  describeSkillStep(klassId: string, level: number, step: LevelStep) {
    const klassLevel = this.getKlassLevel(klassId, level);
    const character = this.build(this.projectStep(klassLevel.id, this.readStep(step)));
    const totalCharacterLevel = this.character.rows.levels.length + (step.editedLevelId ? 0 : 1);
    // A skill's class status is any of the character's classes' (its max rank, `isClassSkill`) and the leveled class's
    // (its cost, `isCurrentClassSkill`)
    const classSkillIds = this.getClassSkillIds(this.rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? []);
    return this.skillStep(character, classSkillIds, totalCharacterLevel);
  }
}
