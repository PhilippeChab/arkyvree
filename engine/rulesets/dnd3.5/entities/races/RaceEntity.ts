import { PlainEntity } from "@/engine/core/entities/index.ts";
import type { SizeType } from "@/shared/enums.ts";

/** A race's form: its name, description, size and base speed. */
type RaceBody = { baseSpeed: number; description?: string | null; name: string; size: SizeType };

/** A race as the ruleset has it: its row, its size and base speed, and its customizations. */
export default class RaceEntity extends PlainEntity<"races", RaceBody> {
  protected readonly label = "Race";

  readonly type = "races";

  /** A form's columns. */
  protected columnsOf({ baseSpeed, description, name, size }: RaceBody) {
    return { baseSpeed, description, name, size };
  }

  /** A race with its modifiers, properties and requirements. */
  override describe(id: string) {
    return this.describeCustomized(id);
  }
}
