import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { SizeType } from "@/shared/enums.ts";

import { RACE_FIELDS } from "./fields.ts";

/** A race's form: its name, description, size and base speed. */
type RaceBody = { baseSpeed: number; description?: string | null; name: string; size: SizeType };

/**
 * A race as the ruleset has it: its row, its size and base speed, the fields its properties hold (whether it walks on
 * four legs, whether armor and load leave its speed), and its customizations.
 */
export default class RaceEntity extends CustomizationPageEntity<
  "races",
  RaceBody,
  RaceBody,
  typeof RACE_FIELDS.fields
> {
  /** Its body's build: four legs, a speed armor leaves. */
  protected override readonly fields = RACE_FIELDS;

  protected override readonly label = "Race";

  override readonly type = "races";

  /** A form's columns. */
  protected override columnsOf({ baseSpeed, description, name, size }: RaceBody) {
    return { baseSpeed, description, name, size };
  }
}
