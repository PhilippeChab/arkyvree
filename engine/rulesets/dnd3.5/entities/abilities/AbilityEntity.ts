import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";

/** An ability as the ruleset has it: its rules seed them, and a ruleset's routes read them as they are. */
export default class AbilityEntity extends RulesetEntity<"abilities"> {
  /** Its rules seed it: a ruleset never writes one. */
  protected static override readonly readOnly = true;

  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  override readonly type = "abilities";
}
