import { type CharacterInput, LevelUpPart, type PlannedSoFar } from "@/engine/core/module/index.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Dnd35Descriptions } from "@/engine/rulesets/dnd3.5/descriptions.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import ClassPicker from "@/engine/rulesets/dnd3.5/pickers/ClassPicker.ts";
import FeatPicker from "@/engine/rulesets/dnd3.5/pickers/FeatPicker.ts";
import PowerPicker from "@/engine/rulesets/dnd3.5/pickers/PowerPicker.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Character } from "@/shared/relations.ts";

import BondedPlans from "./BondedPlans.ts";
import Dnd35LevelSelections from "./Dnd35LevelSelections.ts";
import LevelUpPlan from "./LevelUpPlan.ts";
import LevelUpPreview from "./LevelUpPreview.ts";
import LevelUpSteps from "./LevelUpSteps.ts";

/**
 * The 3.5 level-up, as the module answers the server's level flows, each from the rows the server read: the preview,
 * the bonded creatures the levels make, the wizard's steps and pickers, and a saved level's selections; and the rules
 * core's flows read, with which it removes a level and checks a save and an edit.
 */
export default class Dnd35LevelUp extends LevelUpPart<Dnd35Descriptions, DetailedCharacter> {
  /** The hit points a level counts before they're rolled. */
  override readonly unrolledLevelHp = LevelRules.UNROLLED_LEVEL_HP;

  /** The 3.5 character built from its rows. */
  override buildCharacter(view: RulesetView, input: CharacterInput) {
    return Dnd35CharacterBuilder.build(view, input);
  }

  /** A saved level's selections, as its edit opens them. */
  override describeLevel(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<Dnd35LevelSelections["describeLevel"]>
  ) {
    return new Dnd35LevelSelections(view, character, this).describeLevel(...args);
  }

  /** The level-up wizard's preview of the levels the character plans, each with its ability increases. */
  override describePreview(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPreview["describePreview"]>
  ) {
    return new LevelUpPreview(view, character, this).describePreview(...args);
  }

  /** The level-up wizard's step `name` of the level the step is for: its abilities, skills, feats or powers. */
  override describeStep(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpSteps["describeStep"]>
  ) {
    return new LevelUpSteps(view, character, this).describeStep(...args);
  }

  /** The level-up wizard's steps of a level, in order: the same four for every level. */
  override describeSteps(view: RulesetView, character: CharacterInput) {
    return new LevelUpSteps(view, character, this).describeSteps();
  }

  /**
   * A save's pooled picks spread over its planned levels: each skill's points within each level's points and max ranks,
   * class skills first, and the feats and powers in each level's pool slots.
   */
  override distributePicks(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["distributePicks"]>
  ) {
    return new LevelUpPlan(view, character, this).distributePicks(...args);
  }

  /**
   * The issues an edited level answers for: all the character's (`issues`) but those of the pools the level doesn't add
   * to, which the levels before it or after it give. A level adds to a pool the character allows more of with it
   * (`withLevel`) than without it (`before`).
   */
  override findEditedLevelIssues(issues: RulesIssue[], before: DetailedCharacter, withLevel: DetailedCharacter) {
    const allowedBefore = new Map<string, number>();
    for (const apt of Object.values(before.components.aptitudes.getAptitudes()))
      allowedBefore.set(apt.name, apt.allowed);
    const owned = new Set<string>();
    for (const apt of Object.values(withLevel.components.aptitudes.getAptitudes()))
      if (apt.allowed > (allowedBefore.get(apt.name) ?? 0)) owned.add(apt.name);

    return issues.filter(
      (issue) => issue.category !== "aptitudes" || [...owned].some((name) => issue.message.startsWith(name)),
    );
  }

  /** The pools a save's picks overfill, as the character holding them counts them. */
  override findOverfullPools(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["findOverfullPools"]>
  ) {
    return new LevelUpPlan(view, character, this).findOverfullPools(...args);
  }

  /** What the ability increases of the level after `totalLevel` levels add up to: one, at every fourth level. */
  override getAbilityIncreaseTotal(totalLevel: number) {
    return LevelRules.isAbilityIncreaseLevel(totalLevel) ? 1 : 0;
  }

  /**
   * Each planned level's class and class level: within the rules' bounds (a class's last level, a character's), a
   * player character's class of the view, and one of its levels.
   */
  override getPlannedKlassLevels(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["getPlannedKlassLevels"]>
  ) {
    return new LevelUpPlan(view, character, this).getPlannedKlassLevels(...args);
  }

  /** The hit points a level gains: 1 to its class's hit die, the die's average rounded up between. */
  override hitPointsOf(hd: number) {
    return { average: Math.ceil(hd / 2), max: hd, min: 1 };
  }

  /**
   * The class picker for the character, with what the level-up wizard plans so far, its skill points spread over its
   * planned levels as the save spreads them: its filters, a page described.
   */
  override openClassPicker(view: RulesetView, character: CharacterInput, planned: PlannedSoFar) {
    return new ClassPicker(view, character, planned, new LevelUpPlan(view, character, this));
  }

  /** A feat picker for the character: what it offers and leaves out, and a page of options described. */
  override openFeatPicker(
    view: RulesetView,
    character: CharacterInput,
    query: ConstructorParameters<typeof FeatPicker>[2],
  ) {
    return new FeatPicker(view, character, query);
  }

  /** A power picker for the character: what it offers and leaves out, and a page of options described. */
  override openPowerPicker(
    view: RulesetView,
    character: CharacterInput,
    query: ConstructorParameters<typeof PowerPicker>[2],
  ) {
    return new PowerPicker(view, character, query);
  }

  /** What a master's bonded creatures become with it: each kind's creature removed, kept or made, at its hit dice. */
  override planBondedCreatures(
    view: RulesetView,
    master: DetailedCharacter,
    record: Character,
    bonded: CharacterInput[],
  ) {
    return new BondedPlans(view.rulesetData).planMasterCreatures(master, record, bonded);
  }
}
