import { z } from "zod";

import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";

import { RACE_FIELDS } from "./fields.ts";

/**
 * A race as the ruleset has it: as stored, its fields (its size and base speed, whether it walks on four legs, whether
 * armor and load leave its speed), and its customizations.
 */
export default class RaceEntity extends CustomizationPageEntity<"races", typeof RACE_FIELDS.fields> {
  /** Its size and base speed, its body's build: four legs, a speed armor leaves. */
  protected override readonly fields = RACE_FIELDS;

  protected override readonly label = "Race";

  /** Its list's filters: the kind it's for, its partition (the player races', or the monsters'). */
  protected override readonly listFilters = { partition: z.string() };

  override readonly type = "races";
}
