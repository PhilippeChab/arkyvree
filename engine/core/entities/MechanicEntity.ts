import { FieldCodec } from "@/engine/core/fields/index.ts";

import RulesetEntity from "./RulesetEntity.ts";

/** A mechanic's form: its name and description. */
interface MechanicBody {
  description?: string | null;
  name: string;
}

/** A mechanic as the ruleset has it: its name and its description, which its customizations act through. */
export default class MechanicEntity extends RulesetEntity<"mechanics", MechanicBody> {
  /** None of its own. */
  protected override readonly fields = FieldCodec.NONE;

  protected override readonly label = "Mechanic";

  override readonly type = "mechanics";

  /** A form's columns. */
  protected override columnsOf({ description, name }: MechanicBody) {
    return { description, name };
  }
}
