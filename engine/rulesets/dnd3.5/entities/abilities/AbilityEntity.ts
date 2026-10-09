import { PlainEntity } from "@/engine/core/entities/index.ts";

/** An ability's form: its name and description. */
type AbilityBody = { description?: string | null; name: string };

/** An ability as the ruleset has it: its rules seed them, and a ruleset's routes read them as they are. */
export default class AbilityEntity extends PlainEntity<"abilities", AbilityBody> {
  protected readonly label = "Ability";

  readonly type = "abilities";

  /** A form's columns. */
  protected columnsOf({ description, name }: AbilityBody) {
    return { description, name };
  }
}
