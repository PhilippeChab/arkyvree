import type { PropertyRecord } from "@/server/rulesets/dnd3.5/types.ts";
import type { PropertiesWrite, RaceFields, RacesEffects } from "@/server/rulesets/engine/module/index.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

import { RACE_FIELD_PROPERTY_TYPES } from "./raceFields.ts";

export class Dnd35RacesEffects implements RacesEffects {
  /** A property for each field that's true: a race without one is a biped whose armor and load slow it. */
  private buildProperties(raceId: string, fields: RaceFields): PropertyRecord[] {
    const property = (type: string): PropertyRecord => ({ entityId: raceId, entityType: "races", type, value: "true" });
    return [
      ...(fields.quadruped ? [property(RACE_QUADRUPED)] : []),
      ...(fields.speedIgnoresEncumbrance ? [property(RACE_SPEED_IGNORES_ENCUMBRANCE)] : []),
    ];
  }

  properties(raceId: string, fields: RaceFields): PropertiesWrite {
    return {
      entityId: raceId,
      entityType: "races",
      types: RACE_FIELD_PROPERTY_TYPES,
      rows: this.buildProperties(raceId, fields),
    };
  }
}
