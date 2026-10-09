import { PlainEntity } from "@/engine/core/entities/index.ts";

/** A mechanic's form: its name and description. */
type MechanicBody = { description?: string | null; name: string };

/** A mechanic as the ruleset has it: its name and its description, which its customizations act through. */
export default class MechanicEntity extends PlainEntity<"mechanics", MechanicBody> {
  protected readonly label = "Mechanic";

  readonly type = "mechanics";

  /** A form's columns. */
  protected columnsOf({ description, name }: MechanicBody) {
    return { description, name };
  }
}
