import {
  type CharacterInput,
  type LevelPlanRequest,
  LevelUpPart,
  type StepPickerQuery,
} from "@/engine/core/module/index.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Dnd35Descriptions } from "@/engine/rulesets/dnd3.5/descriptions.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import ClassPicker from "@/engine/rulesets/dnd3.5/pickers/ClassPicker.ts";
import FeatPicker from "@/engine/rulesets/dnd3.5/pickers/FeatPicker.ts";
import SpellPicker from "@/engine/rulesets/dnd3.5/pickers/SpellPicker.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Character } from "@/shared/relations.ts";

import BondedCreatures from "./BondedCreatures.ts";
import BondedPlans from "./BondedPlans.ts";
import LevelPlans from "./LevelPlans.ts";
import LevelRemoval from "./LevelRemoval.ts";
import LevelsPlanning from "./LevelsPlanning.ts";
import type { LevelUpRules } from "./LevelUpBase.ts";
import LevelUpPlan from "./LevelUpPlan.ts";

/**
 * The 3.5 level-up, as the module answers the server's level flows, each from the rows the server read: a level's
 * steps, the plan's answer and a step's picker, a saved level as an edit's plan, what a level-up, an edit and a
 * removal write, checked in order (`LevelsPlanning`), and the bonded creatures the levels make; and the rules its flows
 * read (`LevelUpRules`).
 */
export default class Dnd35LevelUp extends LevelUpPart<Dnd35Descriptions> implements LevelUpRules<DetailedCharacter> {
  /** The hit points a level counts before they're rolled. */
  readonly unrolledLevelHp = LevelRules.UNROLLED_LEVEL_HP;

  /** The plan's answer: Add Level's plan or Edit Level's level, each step in its mechanic's shape. */
  override describePlan(view: RulesetView, character: CharacterInput, request: LevelPlanRequest) {
    return new LevelPlans(view, character, this).describePlan(request);
  }

  /** A saved level as an edit's plan opens it: each step's payload as the level saved it. */
  override describeSavedPlan(view: RulesetView, character: CharacterInput, advancementId: string) {
    return new LevelPlans(view, character, this).describeSavedPlan(advancementId);
  }

  /**
   * A 3.5 level's steps, in the wizard's order: its class plan (but an edit's), hit points, ability increase, skills,
   * feats and spells.
   */
  override listSteps(view: RulesetView, character: CharacterInput, edited: boolean) {
    return new LevelPlans(view, character, this).listSteps(edited);
  }

  /**
   * Step `step`'s picker over the plan: the class picker (the class plan's), or a feat or spell pool's at the level its
   * next pick lands on.
   */
  override openStepPicker(view: RulesetView, character: CharacterInput, step: string, query: StepPickerQuery) {
    const read = new LevelPlans(view, character, this).readStepPicker(step, query);
    switch (read.kind) {
      case "feats":
        return { kind: read.kind, picker: new FeatPicker(view, character, read.query) };
      case "classes": {
        // Its skill points spread over the planned levels as the save spreads them
        const plan = new LevelUpPlan(view, character, this);
        return { kind: read.kind, picker: new ClassPicker(view, character, read.planned, plan) };
      }
      case "spells":
        return { kind: read.kind, picker: new SpellPicker(view, character, read.query) };
    }
  }

  /** What a master's bonded creatures become as its saved levels make them. */
  override planChildren(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]) {
    return new BondedCreatures(view, character, this).planBonded(bonded);
  }

  /**
   * A plan's edit of saved level `advancementId`, read as its save writes it (the level's hit points, ability
   * increases and picks): what it writes, checked unless `force`d, and what the bonded creatures become with it.
   */
  override planLevelEdit(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    advancementId: string,
    request: LevelPlanRequest,
    force: boolean,
  ) {
    const edit = new LevelPlans(view, character, this).readEdit(request);
    return new LevelsPlanning(view, character, this).planEdit(bonded, advancementId, edit, force);
  }

  /**
   * A plan's level-up, read as its save writes it (its levels, each with its hit points and ability increases, and its
   * picks, spread over them): the rows it writes, each level checked and the character with them unless `force`d, and
   * what the master's bonded creatures become.
   */
  override planLevelUp(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    request: LevelPlanRequest,
    force: boolean,
  ) {
    const levelUp = new LevelPlans(view, character, this).readLevelUp(request);
    return new LevelsPlanning(view, character, this).planLevels(bonded, levelUp, force);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  override planRemoval(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]) {
    return new LevelRemoval(view, character, this).planRemoval(bonded);
  }

  /** The 3.5 character built from its rows. */
  buildCharacter(view: RulesetView, input: CharacterInput) {
    return Dnd35CharacterBuilder.build(view, input);
  }

  /**
   * A save's pooled picks spread over its planned levels: each skill's points within each level's points and max ranks,
   * class skills first, and the feats and spells in each level's pool slots.
   */
  distributePicks(view: RulesetView, character: CharacterInput, ...args: Parameters<LevelUpPlan["distributePicks"]>) {
    return new LevelUpPlan(view, character, this).distributePicks(...args);
  }

  /**
   * The issues an edited level answers for: all the character's (`issues`) but those of the pools the level doesn't add
   * to, which the levels before it or after it give. A level adds to a pool the character allows more of with it
   * (`withLevel`) than without it (`before`).
   */
  findEditedLevelIssues(issues: RulesIssue[], before: DetailedCharacter, withLevel: DetailedCharacter) {
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
  findOverfullPools(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["findOverfullPools"]>
  ) {
    return new LevelUpPlan(view, character, this).findOverfullPools(...args);
  }

  /**
   * What the ability increases of the level after `totalLevel` levels add up to: one at each level the ruleset's
   * Settings give one (`LevelRules`).
   */
  getAbilityIncreaseTotal(view: RulesetView, totalLevel: number) {
    return LevelRules.of(view).countAbilityIncreases(totalLevel);
  }

  /**
   * Each planned level's class and class level: within the rules' bounds (a class's last level, a character's), a
   * player character's class of the view, and one of its levels.
   */
  getPlannedClassLevels(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["getPlannedClassLevels"]>
  ) {
    return new LevelUpPlan(view, character, this).getPlannedClassLevels(...args);
  }

  /** The hit points a level gains: 1 to its class's hit die, the die's average rounded up between. */
  hitPointsOf(hd: number) {
    return { average: Math.ceil(hd / 2), max: hd, min: 1 };
  }

  /** What a master's bonded creatures become with it: each kind's creature removed, kept or made, at its hit dice. */
  planBondedCreatures(view: RulesetView, master: DetailedCharacter, record: Character, bonded: CharacterInput[]) {
    return new BondedPlans(Dnd35View.of(view.rulesetData)).planMasterCreatures(master, record, bonded);
  }
}
