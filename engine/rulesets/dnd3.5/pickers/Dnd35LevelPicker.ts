import type { CharacterInput, PickQuery } from "@/engine/core/module/index.ts";
import { LevelPicker } from "@/engine/core/pickers/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

/** A 3.5 feat or power picker (`LevelPicker`): the 3.5 character, each level it projects at its unrolled hit points. */
export default abstract class Dnd35LevelPicker<Details extends object = object> extends LevelPicker<
  DetailedCharacter,
  Details
> {
  constructor(view: RulesetView, input: CharacterInput, query: PickQuery) {
    super(view, input, query, Dnd35CharacterBuilder, LevelRules.UNROLLED_LEVEL_HP);
  }
}
