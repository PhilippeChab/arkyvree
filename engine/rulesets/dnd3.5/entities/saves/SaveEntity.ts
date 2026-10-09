import { PlainEntity } from "@/engine/core/entities/index.ts";

/** A save's form: its name, description and the ability its bonus comes from. */
type SaveBody = { abilityId: string; description?: string | null; name: string };

/** A save as the ruleset has it: its row, and the ability its bonus comes from. */
export default class SaveEntity extends PlainEntity<"saves", SaveBody> {
  protected readonly label = "Save";

  readonly type = "saves";

  /** A form's columns. */
  protected columnsOf({ abilityId, description, name }: SaveBody) {
    return { abilityId, description, name };
  }
}
