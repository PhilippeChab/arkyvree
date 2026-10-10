import { BondedCreatures, LevelRemoval, type LevelUpRules } from "@/engine/core/levelUp/index.ts";
import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { WizardStep } from "@/engine/core/module/descriptions.ts";
import type { OpenedGroupedPicker, OpenedPicker, PickFilters, PickGroupFilters } from "@/engine/core/module/pickers.ts";
import type { BondedCreaturesPlan, LevelEditPlan, LevelRemovalPlan, LevelsPlan } from "@/engine/core/module/plans.ts";
import type {
  FeatPickQuery,
  LevelEditRequest,
  LevelQuery,
  LevelUpRequest,
  PlannedSoFar,
  PowerPickQuery,
  PreviewRequest,
} from "@/engine/core/module/requests.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Character, Klass } from "@/shared/relations.ts";

/**
 * What a ruleset answers of a character's levels, from the rows the server reads: the level-up wizard's steps (which it
 * lists, and answers by name), preview and pickers, a saved level's selections, and what a save, an edit or a removal
 * writes, with what the master's bonded creatures become. Its descriptions are the ruleset's own (`D`); its plans are
 * the rows the server writes. Its level-up rules (`LevelUpRules`: how its character `C` is built, what a level's
 * ability increases add up to, what bonded creatures become) are what every flow reads: a removal and the bonded
 * creatures follow from them alone.
 */
export default abstract class LevelUpPart<D extends Descriptions, C = unknown> implements LevelUpRules<C> {
  /** The ruleset's character built from its rows, in the ruleset's view. */
  abstract buildCharacter(view: RulesetView, input: CharacterInput): C;

  /** A saved level's selections, as its edit opens them: refused when the character has no such level. */
  abstract describeLevel(view: RulesetView, character: CharacterInput, characterLevelId: string): D["levelSelections"];

  /**
   * The wizard's preview of the levels the character plans (`request`), each with its ability increases, and of what the
   * wizard picked over them so far, which the preview says what it comes to.
   */
  abstract describePreview(view: RulesetView, character: CharacterInput, request: PreviewRequest): D["preview"];

  /**
   * The wizard's step `name` of the level `query` is for, named for which it is: refused when the ruleset has no such
   * step, or when the step reads the level's class and `query` names none.
   */
  abstract describeStep(view: RulesetView, character: CharacterInput, name: string, query: LevelQuery): D["step"];

  /** The wizard's steps of the level `query` is for, in order: each by the name `describeStep` answers it by. */
  abstract describeSteps(
    view: RulesetView,
    character: CharacterInput,
    query: LevelQuery,
  ): readonly WizardStep<D["step"]["name"]>[];

  /** What the ability increases of the level after `totalLevel` levels add up to: 0 when it takes none. */
  abstract getAbilityIncreaseTotal(totalLevel: number): number;

  /** The class picker, with what the wizard plans so far: the classes it offers, each with the level it would take. */
  abstract openClassPicker(
    view: RulesetView,
    character: CharacterInput,
    planned: PlannedSoFar,
  ): OpenedPicker<{ kind: string }, Klass, D["classOption"]>;

  /** A feat picker at a level, a family's feats when the query names one: the feats it offers, flat or by family. */
  abstract openFeatPicker(
    view: RulesetView,
    character: CharacterInput,
    query: FeatPickQuery,
  ): OpenedGroupedPicker<PickFilters, PickGroupFilters, { id: string }, D["featOption"], D["featGroup"]>;

  /** A power picker at a level, of a spell level when given: the powers it offers, less those picked so far. */
  abstract openPowerPicker(
    view: RulesetView,
    character: CharacterInput,
    query: PowerPickQuery,
  ): OpenedPicker<PickFilters, { id: string }, D["powerOption"]>;
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
  /** A saved level's edit: what it writes, checked unless `force`d, and what the bonded creatures become with it. */
  abstract planEdit(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    characterLevelId: string,
    edit: LevelEditRequest,
    force: boolean,
  ): LevelEditPlan;

  /**
   * The levels a level-up writes (`request`), with its picks spread over them: the rows it writes, and what the master's
   * bonded creatures become. The character with them is refused with what it fails, unless `force`d.
   */
  abstract planLevels(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    request: LevelUpRequest,
    force: boolean,
  ): LevelsPlan;

  /** What a master's bonded creatures (`bonded`, their rows) become as its saved levels make them. */
  planBonded(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): BondedCreaturesPlan {
    return new BondedCreatures(view, character, this).planBonded(bonded);
  }

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  planRemoval(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): LevelRemovalPlan {
    return new LevelRemoval(view, character, this).planRemoval(bonded);
  }
}
