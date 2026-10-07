import type { RaceFields } from "@/server/rulesets/engine/module/index.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

/** The property types a race's fields are stored as. */
export const RACE_FIELD_PROPERTY_TYPES = [RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE];

/** A race's fields, read off the rows of its properties: each is true when its property says so. */
export function readRaceFields(properties: { type: string; value: string }[]): RaceFields {
  const isSet = (type: string) => properties.some((property) => property.type === type && property.value === "true");
  return { quadruped: isSet(RACE_QUADRUPED), speedIgnoresEncumbrance: isSet(RACE_SPEED_IGNORES_ENCUMBRANCE) };
}
