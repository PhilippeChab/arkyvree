import { RulesetEntity } from "@/engine/core/entities/index.ts";
import { FieldCodec } from "@/engine/core/fields/index.ts";

import { SAVE_COLUMNS } from "./columns.ts";

/** A save's form: its name, description and the ability its bonus comes from. */
interface SaveBody {
  abilityId: string;
  description?: string | null;
  name: string;
}

/** A save as the ruleset has it: its row, and the ability its bonus comes from. */
export default class SaveEntity extends RulesetEntity<"saves", SaveBody> {
  /** The ability its bonus comes from. */
  protected override readonly columns = SAVE_COLUMNS;

  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Save";

  override readonly type = "saves";

  /** A form's columns. */
  protected override columnsOf({ abilityId, description, name }: SaveBody) {
    return { abilityId, description, name };
  }

  /** A form's ability, the view's: none of an edit that leaves it out (its columns keep it). */
  protected override resolveIds({ abilityId }: Partial<SaveBody>) {
    return abilityId === undefined ? {} : { abilityId: this.ids.resolve("abilities", abilityId) };
  }
}
