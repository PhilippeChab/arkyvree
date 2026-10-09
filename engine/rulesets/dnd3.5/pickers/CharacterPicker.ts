import type { CharacterInput, CharacterProjection } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { Requirement } from "@/shared/relations.ts";

import Picker from "./Picker.ts";

/**
 * A level-up's picker for a character, from its rows (`input`): it checks an option's requirements against the character
 * as the level-up plans it (`project`), built once, when an option first asks.
 */
export default abstract class CharacterPicker<
  Row extends { id: string },
  Details extends object = object,
> extends Picker<Row, Details> {
  constructor(
    view: RulesetView,
    protected readonly input: CharacterInput,
  ) {
    super(view);
  }

  /** The character the picker checks against, once built. */
  private built?: DetailedCharacter;

  /** The character the picker checks options against: built from its projection when first asked. */
  protected get character(): DetailedCharacter {
    return (this.built ??= CharacterBuilder.build(this.view, this.project().input));
  }

  /** The tree of the requirement groups the character fails, one line a group. */
  protected describeFailed(groups: Requirement[][]) {
    return groups.map((requirements) => this.character.formatRequirements(requirements)).join("\n");
  }

  /** Whether the character meets an option's requirement groups. */
  protected meets(groups: Requirement[][], _row: Row) {
    return this.character.areRequirementsMet(groups);
  }

  /** The character's rows with what the level-up plans before the pick. */
  protected abstract project(): CharacterProjection;
}
