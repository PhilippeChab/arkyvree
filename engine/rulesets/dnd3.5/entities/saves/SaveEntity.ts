import { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Dnd35Kinds } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import { SAVE_FIELDS } from "./fields.ts";

/** A save as the ruleset has it: its row, and the ability its bonus comes from. */
export default class SaveEntity extends RulesetEntity<Dnd35Kinds, "saves", typeof SAVE_FIELDS.fields> {
  /** The ability its bonus comes from. */
  protected override readonly fields = SAVE_FIELDS;

  override readonly type = "saves";
}
