import type { GeneratedFeatsWrite, PropertiesWrite } from "@/engine/core/module/index.ts";
import type { FeatFields, PowerFields, PowersEffects } from "@/engine/rulesets/dnd3.5/module/index.ts";

import { POWER_FIELD_PROPERTY_TYPES, toPowerProperties } from "./powerFields.ts";
import { buildSpellFocusFeats } from "./spellGenerator.ts";

export class Dnd35PowersEffects implements PowersEffects {
  generatedFeats(grouping: string): GeneratedFeatsWrite<FeatFields> {
    return buildSpellFocusFeats(grouping);
  }

  /** A spell's fields, as properties: none without a school. */
  properties(powerId: string, fields: PowerFields): PropertiesWrite {
    return {
      entityId: powerId,
      entityType: "powers",
      types: POWER_FIELD_PROPERTY_TYPES,
      rows: toPowerProperties(powerId, fields),
    };
  }
}
