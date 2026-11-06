import { CustomizationPageEntity } from "@/engine/core/entities/index.ts";
import type { Dnd52Kinds } from "@/engine/rulesets/dnd5.2/view/rows.ts";

import { BACKGROUND_FIELDS } from "./fields.ts";

/**
 * A background as the ruleset has it: as stored, the three abilities its increases go to (its `abilityScore` links),
 * and its customizations, which grant its Origin feat, its skill and tool proficiencies, and its ability increases'
 * pick (the pool of the ways they spread).
 */
export default class BackgroundEntity extends CustomizationPageEntity<
  Dnd52Kinds,
  "backgrounds",
  typeof BACKGROUND_FIELDS.fields
> {
  /** Its three abilities. */
  protected override readonly fields = BACKGROUND_FIELDS;

  override readonly type = "backgrounds";
}
