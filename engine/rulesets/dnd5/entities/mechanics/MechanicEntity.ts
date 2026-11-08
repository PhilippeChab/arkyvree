import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";
import type { Dnd5Kinds } from "@/engine/rulesets/dnd5/view/rows.ts";

/** A mechanic as the ruleset has it: its name and its description, which its customizations act through. */
export default class MechanicEntity extends RulesetEntity<Dnd5Kinds, "mechanics"> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  override readonly type = "mechanics";
}
