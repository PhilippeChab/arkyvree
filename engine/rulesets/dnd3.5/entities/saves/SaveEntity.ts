import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";

import { SAVE_COLUMNS } from "./columns.ts";

/** A save as the ruleset has it: its row, and the ability its bonus comes from. */
export default class SaveEntity extends RulesetEntity<"saves"> {
  /** The ability its bonus comes from. */
  protected override readonly columns = SAVE_COLUMNS;

  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Save";

  override readonly type = "saves";
}
