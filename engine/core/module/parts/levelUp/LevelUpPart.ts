import {
  BondedCreatures,
  type CheckedCharacter,
  type LevelHitPoints,
  LevelRemoval,
  LevelsPlanning,
  type LevelUpRules,
  type OverfullPool,
  type PlannedClassLevel,
} from "@/engine/core/levelUp/index.ts";
import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Character } from "@/shared/relations.ts";

import type { LevelPlanAnswer, LevelPlanRequest, LevelSteps, StepPickerQuery } from "./mechanics.ts";
import type { BondedCreaturesPlan, LevelEditPlan, LevelRemovalPlan, LevelsPlan } from "./plans.ts";
import type { LevelEditRequest, LevelPicks, LevelRequest, LevelUpRequest } from "./requests.ts";

/**
 * What a ruleset answers of a character's levels, from the rows the server reads: a level's steps by their mechanics,
 * the plan's answer and a step's picker over it, a saved level as an edit's plan, and what a save, an edit or a removal
 * writes, with what the master's bonded creatures become. Its descriptions are the ruleset's own (`D`); its plans are
 * the rows the server writes. Its level-up rules (`LevelUpRules`: how its character `C` is built, what a level's
 * ability increases add up to and its hit points, what bonded creatures become, a save's planned levels and its picks
 * spread over them, the pools picks overfill, the issues an edited level answers for) are what every flow reads: a
 * removal and the bonded creatures follow from them alone, and a save and an edit are checked over them in the order
 * every ruleset's are (`LevelsPlanning`).
 */
export default abstract class LevelUpPart<
  D extends Descriptions,
  C extends CheckedCharacter = CheckedCharacter,
> implements LevelUpRules<C> {
  /** The hit points a level counts before they're rolled: a level a flow projects, whose hit points its save sets. */
  abstract readonly unrolledLevelHp: number;

  /** The ruleset's character built from its rows, in the ruleset's view. */
  abstract buildCharacter(view: RulesetView, input: CharacterInput): C;

  /**
   * The plan's answer (`request`, each id the view's): each step's answer in its mechanic's shape, by its name, and the
   * plan's advancements; Add Level's plan, and Edit Level's level in its place (`request.editedLevelId`) alike.
   */
  abstract describePlan(view: RulesetView, character: CharacterInput, request: LevelPlanRequest): LevelPlanAnswer;

  /**
   * The character's saved level `characterLevelId` as an edit's plan opens it: each step's payload as the level saved
   * it. Refused when the character has no such level.
   */
  abstract describeSavedPlan(view: RulesetView, character: CharacterInput, characterLevelId: string): LevelPlanRequest;

  /** A save's pooled picks (`picks`) spread over its planned levels (`levels`, in order), as the ruleset spreads them. */
  abstract distributePicks(
    view: RulesetView,
    character: CharacterInput,
    levels: PlannedClassLevel[],
    picks: LevelPicks,
  ): LevelPicks[];

  /**
   * The issues an edited level answers for, of the character's with it (`issues`): read off the character as it was
   * before the level (`before`), and with the level alone after that (`withLevel`).
   */
  abstract findEditedLevelIssues(issues: RulesIssue[], before: C, withLevel: C): RulesIssue[];

  /** The pools picks (`picks`) overfill in the character holding them (`holder`), as the ruleset counts them. */
  abstract findOverfullPools(
    view: RulesetView,
    character: CharacterInput,
    holder: C,
    picks: Pick<LevelPicks, "feats" | "powers">,
  ): OverfullPool[];

  /** What the ability increases of the level after `totalLevel` levels add up to in the view's ruleset: 0 for none. */
  abstract getAbilityIncreaseTotal(view: RulesetView, totalLevel: number): number;

  /**
   * Each planned level's class and class level, with its ability increases (`levels`), the ruleset's: refused when a
   * class or a class level isn't, or the levels go past its bounds.
   */
  abstract getPlannedKlassLevels(
    view: RulesetView,
    character: CharacterInput,
    levels: Omit<LevelRequest, "hp">[],
  ): PlannedClassLevel[];

  /** The hit points a level of a class with hit die `hd` gains: the least, the most, and the average. */
  abstract hitPointsOf(hd: number): LevelHitPoints;

  /**
   * A level's steps, in the wizard's order, each its mechanic's (an edit's, `edited`, without the step that plans the
   * track its level is on, which an edit keeps), and the words its advancements take.
   */
  abstract listSteps(view: RulesetView, character: CharacterInput, edited: boolean): LevelSteps;

  /**
   * Step `step`'s picker over the plan (`query`, each id the view's), at the advancement its pick lands on: the kind it
   * reads a page of, and its picker. Refused for a step that opens none.
   */
  abstract openStepPicker(
    view: RulesetView,
    character: CharacterInput,
    step: string,
    query: StepPickerQuery,
  ): D["stepPicker"];

  /**
   * What bonded creatures (`bonded`, their rows) become with their master as `master` builds it, kind by kind, from its
   * row (`record`), which a creature it makes takes after.
   */
  abstract planBondedCreatures(
    view: RulesetView,
    master: C,
    record: Character,
    bonded: CharacterInput[],
  ): BondedCreaturesPlan;

  /**
   * A plan request's edit (`request`, each id the view's) of the level it edits (`request.editedLevelId`), as its save
   * writes it: the level's hit points, ability increases and picks.
   */
  abstract readEdit(view: RulesetView, character: CharacterInput, request: LevelPlanRequest): LevelEditRequest;

  /**
   * A plan request's level-up (`request`, each id the view's), as its save writes it: its levels, each with its hit
   * points and ability increases, and its picks, pooled over them. Refused when an advancement has no value its save
   * needs.
   */
  abstract readLevelUp(view: RulesetView, character: CharacterInput, request: LevelPlanRequest): LevelUpRequest;

  /** What a master's bonded creatures (`bonded`, their rows) become as its saved levels make them. */
  planBonded(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): BondedCreaturesPlan {
    return new BondedCreatures(view, character, this).planBonded(bonded);
  }

  /**
   * A saved level's edit: what it writes, checked in the order every ruleset's is (`LevelsPlanning`) unless `force`d,
   * and what the bonded creatures become with it.
   */
  planEdit(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    characterLevelId: string,
    edit: LevelEditRequest,
    force: boolean,
  ): LevelEditPlan {
    return new LevelsPlanning(view, character, this).planEdit(bonded, characterLevelId, edit, force);
  }

  /**
   * The levels a level-up writes (`request`), with its picks spread over them: the rows it writes, and what the master's
   * bonded creatures become. Each level is checked in the order every ruleset's is (`LevelsPlanning`), and the character
   * with them refused with what it fails, unless `force`d.
   */
  planLevels(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    request: LevelUpRequest,
    force: boolean,
  ): LevelsPlan {
    return new LevelsPlanning(view, character, this).planLevels(bonded, request, force);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  planRemoval(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): LevelRemovalPlan {
    return new LevelRemoval(view, character, this).planRemoval(bonded);
  }
}
