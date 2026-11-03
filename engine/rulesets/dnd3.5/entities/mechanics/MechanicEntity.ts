import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";

/** A mechanic as the ruleset has it: its name and its description, which its customizations act through. */
export default class MechanicEntity extends RulesetEntity<"mechanics"> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  override readonly type = "mechanics";
}
