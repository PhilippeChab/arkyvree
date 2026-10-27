import type { BuildsCharacters } from "@/engine/core/character/index.ts";
import type { CharacterInput, OptionRow, PickerOption, StepOption } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Requirement } from "@/shared/relations.ts";

import Picker from "./Picker.ts";

/** What a picker checks an option against: a character, built, whose requirements it evaluates and words. */
export interface PickingCharacter {
  /** Whether the character meets requirement groups. */
  areRequirementsMet(requirementGroups: Requirement[][]): boolean;
  /** A requirement group's tree, as the client shows what the character fails. */
  formatRequirements(requirements: Requirement[]): string;
}

/**
 * A level-up's picker for a character, from its rows (`input`): it checks an option's requirements against the character
 * as the level-up plans it (`project`), built by its ruleset's builder (`builder`) once, when an option first asks, and
 * describes a page as a level step's options (`describeOptions`).
 */
export default abstract class CharacterPicker<
  C extends PickingCharacter,
  Row extends { id: string },
  Details extends object = object,
> extends Picker<Row, Details> {
  constructor(
    view: RulesetView,
    protected readonly input: CharacterInput,
    private readonly builder: BuildsCharacters<C>,
  ) {
    super(view);
  }

  /** The character the picker checks against, once built. */
  private built?: C;

  /** The character's rows with what the level-up plans before the pick. */
  protected abstract project(): CharacterInput;

  /** The tree of the requirement groups the character fails, one line a group. */
  protected override describeFailed(groups: Requirement[][]) {
    return groups.map((requirements) => this.character.formatRequirements(requirements)).join("\n");
  }

  /** Whether the character meets an option's requirement groups. */
  protected override meets(groups: Requirement[][], _row: Row) {
    return this.character.areRequirementsMet(groups);
  }

  /** The character built from its rows (a projection of them), by its ruleset's builder. */
  protected build(input: CharacterInput): C {
    return this.builder.build(this.view, input);
  }

  /** The character the picker checks options against: built from its projection when first asked. */
  protected get character(): C {
    return (this.built ??= this.build(this.project()));
  }

  /** An option as a step's: its entity, whether the character may take it, and what it lacks when not. */
  protected stepOptionOf(option: PickerOption<OptionRow, Details>): StepOption {
    const { description, eligible, id, name, requirementTree } = option;
    return { description, eligible, id, name, ...(requirementTree && { requirementTree }) };
  }

  /**
   * A page's options (`rows`, as the server read them) as a level step's, each its entity, whether the character may
   * take it, and what it lacks when not.
   */
  describeOptions<R extends Row & OptionRow>(rows: R[]): StepOption[] {
    return this.describe(rows).map((option) => this.stepOptionOf(option));
  }
}
