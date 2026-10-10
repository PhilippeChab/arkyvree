import { FieldCodec } from "@/engine/core/fields/index.ts";

import RulesetEntity from "./RulesetEntity.ts";

/** A save's form: its name, description and the ability its bonus comes from. */
interface SaveBody {
  abilityId: string;
  description?: string | null;
  name: string;
}

/** A save as the ruleset has it: its row, and the ability its bonus comes from. */
export default class SaveEntity extends RulesetEntity<"saves", SaveBody> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Save";

  override readonly type = "saves";

  /** A form's columns. */
  protected override columnsOf({ abilityId, description, name }: SaveBody) {
    return { abilityId, description, name };
  }
}
