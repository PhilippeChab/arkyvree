import { z } from "zod";

import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { EntityFieldValues } from "@/engine/core/fields/index.ts";
import type { SizeType } from "@/vocabulary/dnd3.5/sizes.ts";

import { RACE_COLUMNS } from "./columns.ts";
import { RACE_FIELDS } from "./fields.ts";

/** A race's form: its name, description, size and base speed, and its fields (four legs, a speed armor leaves). */
interface RaceBody {
  baseSpeed: number;
  description?: string | null;
  fields?: EntityFieldValues;
  name: string;
  size: SizeType;
}

/**
 * A race as the ruleset has it: as stored, its fields (its size and base speed, which its form's columns show, whether it
 * walks on four legs, whether armor and load leave its speed), and its customizations.
 */
export default class RaceEntity extends CustomizationPageEntity<
  "races",
  RaceBody,
  Omit<RaceBody, "fields">,
  typeof RACE_FIELDS.fields
> {
  /** Its size and base speed. */
  protected override readonly columns = RACE_COLUMNS;

  /** Its body's build: four legs, a speed armor leaves. */
  protected override readonly fields = RACE_FIELDS;

  protected override readonly label = "Race";

  /** A list of the player races or of the monsters', by their kind. */
  protected override readonly listColumns = ["kind"];

  /** Its list's filters: the kind it's for. */
  protected override readonly listFilters = { kind: z.string() };

  /** The kind it's for: its partition. */
  protected override readonly storedAt = { kind: "partition" } as const;

  override readonly type = "races";

  /** A form's columns. */
  protected override columnsOf({ baseSpeed, description, name, size }: RaceBody) {
    return { baseSpeed, description, name, size };
  }
}
