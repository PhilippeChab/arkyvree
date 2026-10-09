import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/model/projection.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { include } from "@/lib/mixins.ts";

import { Projects } from "./concerns/Projects.ts";
import LevelUpState from "./LevelUpState.ts";

/**
 * What a level-up step projects: a new level after the levels planned before it (`pendingLevel…`), or an edit of one
 * of the character's (`editedLevel`), which the projected level replaces.
 */
interface StepProjection {
  /** The projected level's ability increase. */
  abilityId?: string;
  /** The level edited: the projected level takes its place, so the first level stays the first (its x4 skill points). */
  editedLevel?: { id: string; position: number };
  pendingLevelAbilityIds?: (string | undefined)[];
  pendingLevelKlassLevelIds?: string[];
}

/** A step as the wizard asks for it: the level it edits by its id, which the step's projection takes with its place. */
export type Step = Omit<StepProjection, "editedLevel"> & { editedLevelId?: string };

/**
 * The level-up wizard's steps for a character, from its rows: its ability increase, its feat and power pools, and its
 * skill points, each for the character built with the step's level.
 */
export default class LevelUpSteps extends include(LevelUpState, Projects) {
  constructor(
    view: RulesetView,
    private readonly character: CharacterInput,
  ) {
    super(view);
  }

  /** The feats step: the feat pools of the character built with the step, and the feats its class level grants. */
  private buildFeatSlots(character: DetailedCharacter, klassLevelId: string) {
    const { featPools: aptitudePools, featsToSelect } = character.components.aptitudes.getLevelUpPools(
      this.rulesetData,
    );
    return {
      featsToSelect,
      autoGrantedFeats: (this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevelId) ?? []).map(
        (rec) => rec.featsInRule,
      ),
      aptitudePools,
    };
  }

  /** The powers step: the power pools of the character built with the step, and the powers its class level grants. */
  private buildPowerSlots(character: DetailedCharacter, klassLevelId: string) {
    const { powerPools: aptitudePools, powersToSelect } = character.components.aptitudes.getLevelUpPools(
      this.rulesetData,
    );
    const autoGrantedPowers = (this.rulesetData.klassLevelPowersWithPowersByKlassLevel.get(klassLevelId) ?? []).map(
      (rec) => ({ ...rec.powersInRule, free: rec.free }),
    );
    return { powersToSelect, autoGrantedPowers, aptitudePools };
  }

  /**
   * The skills step: the points to spend, and each skill with its class status. A skill's class status is any of the
   * character's classes' (its max rank, `isClassSkill`) and the leveled class's (its cost, `isCurrentClassSkill`). The
   * client caps a rank by the character's total level after the step (`totalCharacterLevel`).
   */
  private buildSkillSlots(character: DetailedCharacter, klassId: string, totalCharacterLevel: number) {
    const { skills } = character.components;
    const currentClassSkillIds = this.getClassSkillIds(
      this.rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [],
    );
    return {
      skillPointsToSpend: Math.max(1, skills.getSkillBudget().available),
      totalCharacterLevel,
      skills: skills.getEnrichedSkills(this.rulesetData.skills, currentClassSkillIds),
    };
  }

  /**
   * The attributes step's character, built without the edited level and those after it: `undefined` when the level
   * takes no ability increase, after the character's `levels` but those, and the pending ones.
   */
  private projectAttributeStep(
    excludeCharacterLevelId?: string,
    pendingLevelCount?: number,
  ): { projected?: ProjectedCharacterData } | undefined {
    const { levels } = this.character.rows;
    const excludeIds = excludeCharacterLevelId ? this.getLevelIdsFromOnward(levels, excludeCharacterLevelId) : [];
    // The levels before this one: the level added or edited is the next
    const totalLevel = levels.length - excludeIds.length + (pendingLevelCount ?? 0);
    if (!LevelRules.isAbilityIncreaseLevel(totalLevel)) return undefined;
    return excludeIds.length > 0 ? { projected: { excludeCharacterLevelIds: excludeIds } } : {};
  }

  /** The feats step's projection: the step's, with the feats its class level grants. */
  private projectFeatStep(klassLevelId: string, projection: StepProjection): ProjectedCharacterData {
    const grantedRecords = this.rulesetData.klassLevelFeatsWithFeatsByKlassLevel.get(klassLevelId) ?? [];
    const customizations = this.loadFeatCustomizations(grantedRecords.map((rec) => rec.featsInRule.id));
    const { level, data } = this.projectStep(klassLevelId, projection);
    return { ...data, givenFeats: this.buildProjectedGivenFeats(grantedRecords, level.id, customizations) };
  }

  /**
   * The step's projected level of class level `klassLevelId`, and the projection it goes in: after the pending levels,
   * or in place of the edited one. Its id is fresh, so the loader doesn't count the stored level's granted feats twice.
   */
  private projectStep(klassLevelId: string, projection: StepProjection) {
    const characterId = this.character.record.id;
    const { editedLevel, abilityId, pendingLevelKlassLevelIds, pendingLevelAbilityIds } = projection;
    const pendingLevels = pendingLevelKlassLevelIds?.length
      ? this.buildPendingCharacterLevels(characterId, pendingLevelKlassLevelIds, pendingLevelAbilityIds)
      : [];
    const projected = this.buildProjectedCharacterLevel(characterId, klassLevelId, abilityId);
    const level = editedLevel ? { ...projected, position: editedLevel.position } : projected;
    const data: ProjectedCharacterData = {
      ...(editedLevel && { excludeCharacterLevelIds: [editedLevel.id] }),
      characterLevels: [...pendingLevels, level],
    };
    return { level, data };
  }

  /** The step's projection, the edited level's place read off the character's levels: refused when it has no such level. */
  private readStep({ editedLevelId, ...step }: Step): StepProjection {
    if (!editedLevelId) return step;
    const editedLevel = this.character.rows.levels.find((level) => level.id === editedLevelId);
    if (!editedLevel) throw new RulesError("not-found", "Character level not found");
    return { ...step, editedLevel };
  }

  /**
   * The attributes step: the character's abilities, when the level it adds or edits takes an ability increase (after its
   * levels but the edited one and those after it, and the `pendingLevelCount` levels planned before it).
   */
  getAttributeSlots(excludeCharacterLevelId?: string, pendingLevelCount?: number) {
    const step = this.projectAttributeStep(excludeCharacterLevelId, pendingLevelCount);
    if (!step) return { isAvailable: false, attributes: {} };
    const built = this.build(this.character, step.projected);
    return { isAvailable: true, attributes: built.components.abilities.getAbilitiesWithIds() };
  }

  /** The feats step of class `klassId`'s `level`: the pools the character picks feats in with it, and its grants. */
  getFeatSlots(klassId: string, level: number, step: Step) {
    const klassLevel = this.getKlassLevel(klassId, level);
    const projected = this.projectFeatStep(klassLevel.id, this.readStep(step));
    return this.buildFeatSlots(this.build(this.character, projected), klassLevel.id);
  }

  /** The powers step of class `klassId`'s `level`: the pools the character picks powers in with it, and its grants. */
  getPowerSlots(klassId: string, level: number, step: Step) {
    const klassLevel = this.getKlassLevel(klassId, level);
    const projected = this.projectStep(klassLevel.id, this.readStep(step)).data;
    return this.buildPowerSlots(this.build(this.character, projected), klassLevel.id);
  }

  /**
   * The skills step of class `klassId`'s `level`: the points to spend and each skill's class status. An edit replaces
   * the edited level, so the character's level count stays its total.
   */
  getSkillSlots(klassId: string, level: number, step: Step) {
    const klassLevel = this.getKlassLevel(klassId, level);
    const projected = this.projectStep(klassLevel.id, this.readStep(step)).data;
    const totalCharacterLevel = this.character.rows.levels.length + (step.editedLevelId ? 0 : 1);
    return this.buildSkillSlots(this.build(this.character, projected), klassId, totalCharacterLevel);
  }
}
