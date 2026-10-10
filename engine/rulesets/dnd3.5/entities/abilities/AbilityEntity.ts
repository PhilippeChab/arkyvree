import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";

/** An ability's form: its name and description. */
type AbilityBody = { description?: string | null; name: string };

/** An ability as the ruleset has it: its rules seed them, and a ruleset's routes read them as they are. */
export default class AbilityEntity extends RulesetEntity<"abilities", AbilityBody> {
  /** None of its own. */
  protected readonly fields = FieldCodec.NONE;

  protected readonly label = "Ability";

  readonly type = "abilities";

  /** A form's columns. */
  protected columnsOf({ description, name }: AbilityBody) {
    return { description, name };
  }
}
