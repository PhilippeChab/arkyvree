import { RulesetEntity } from "@/engine/core/entities/index.ts";

import { SAVE_FIELDS } from "./fields.ts";

/** A save as the ruleset has it: its row, and the ability its bonus comes from. */
export default class SaveEntity extends RulesetEntity<"saves", typeof SAVE_FIELDS.fields> {
  /** The ability its bonus comes from. */
  protected override readonly fields = SAVE_FIELDS;

  protected override readonly label = "Save";

  override readonly type = "saves";
}
