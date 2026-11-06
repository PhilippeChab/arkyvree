import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { Dnd52Kinds } from "@/engine/rulesets/dnd5.2/view/rows.ts";

import { SPECIES_FIELDS } from "./fields.ts";

/**
 * A species as the ruleset has it: as stored, its fields (its size and speed), and its customizations, which its traits
 * are (darkvision, a feat it grants, a pool's pick it gives).
 */
export default class SpeciesEntity extends CustomizationPageEntity<
  Dnd52Kinds,
  "species",
  typeof SPECIES_FIELDS.fields
> {
  /** Its list narrows by the kind it's for, its partition: the player characters'. */
  protected static override readonly partitioned = true;

  /** Its size and speed. */
  protected override readonly fields = SPECIES_FIELDS;

  override readonly type = "species";
}
