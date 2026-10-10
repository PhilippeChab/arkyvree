import type { CharacterInput } from "@/engine/core/module/CharacterInputs.ts";
import type { Descriptions } from "@/engine/core/module/contract.ts";
import type {
  BondedCreaturesPlan,
  LevelEditPlan,
  LevelEditRequest,
  LevelPicks,
  LevelRemovalPlan,
  LevelRequest,
  LevelsPlan,
  LevelStep,
  PickLevel,
  PlannedSoFar,
} from "@/engine/core/module/levelUp.ts";
import type { OpenedGroupedPicker, OpenedPicker, PickFilters, PickGroupFilters } from "@/engine/core/module/pickers.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Klass } from "@/shared/relations.ts";

/**
 * What a ruleset answers of a character's levels, from the rows the server reads: the level-up wizard's steps, preview
 * and pickers, a saved level's selections, and what a save, an edit or a removal writes, with what the master's bonded
 * creatures become. Its descriptions are the ruleset's own (`D`); its plans are the rows the server writes.
 */
export default abstract class LevelUpPart<D extends Descriptions> {
  /**
   * The wizard's ability step: the character's abilities, when the level it adds (after `pendingLevelCount` planned
   * ones) or edits (`excludeCharacterLevelId`) takes an increase.
   */
  abstract describeAbilityStep(
    view: RulesetView,
    character: CharacterInput,
    excludeCharacterLevelId?: string,
    pendingLevelCount?: number,
  ): D["abilityStep"];

  /** The wizard's feats step of class `klassId`'s `level`: the pools the character picks feats in, and its grants. */
  abstract describeFeatStep(
    view: RulesetView,
    character: CharacterInput,
    klassId: string,
    level: number,
    step: LevelStep,
  ): D["featStep"];

  /** A saved level's selections, as its edit opens them: refused when the character has no such level. */
  abstract describeLevel(view: RulesetView, character: CharacterInput, characterLevelId: string): D["levelSelections"];

  /** The wizard's powers step of class `klassId`'s `level`: the pools the character picks powers in, and its grants. */
  abstract describePowerStep(
    view: RulesetView,
    character: CharacterInput,
    klassId: string,
    level: number,
    step: LevelStep,
  ): D["powerStep"];

  /** The wizard's preview of the levels the character plans, each with its ability increase (`abilityIds`, by place). */
  abstract describePreview(
    view: RulesetView,
    character: CharacterInput,
    levels: { klassId: string; level: number }[],
    abilityIds: (string | null)[],
  ): D["preview"];

  /** The wizard's skills step of class `klassId`'s `level`: the points to spend and each skill's class status. */
  abstract describeSkillStep(
    view: RulesetView,
    character: CharacterInput,
    klassId: string,
    level: number,
    step: LevelStep,
  ): D["skillStep"];

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
    query: PickLevel & { family?: string },
  ): OpenedGroupedPicker<PickFilters, PickGroupFilters, { id: string }, D["featOption"], D["featGroup"]>;

  /** A power picker at a level, of a spell level when given: the powers it offers, less those picked so far. */
  abstract openPowerPicker(
    view: RulesetView,
    character: CharacterInput,
    query: PickLevel & { powerLevel?: number; selectedPowerIds?: string[] },
  ): OpenedPicker<PickFilters, { id: string }, D["powerOption"]>;

  /** What a master's bonded creatures (`bonded`, their rows) become as its saved levels make them. */
  abstract planBonded(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): BondedCreaturesPlan;

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
   * The levels a level-up saves, with its picks spread over them: the rows the save writes, and what the master's
   * bonded creatures become. The character with them is refused with what it fails, unless `force`d.
   */
  abstract planLevels(
    view: RulesetView,
    character: CharacterInput,
    bonded: CharacterInput[],
    levels: LevelRequest[],
    picks: LevelPicks,
    force: boolean,
  ): LevelsPlan;

  /** The character's last level removed: the level that goes, and what its bonded creatures become without it. */
  abstract planRemoval(view: RulesetView, character: CharacterInput, bonded: CharacterInput[]): LevelRemovalPlan;
}
