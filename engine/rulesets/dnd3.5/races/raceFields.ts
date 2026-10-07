import type { PropertyValue } from "@/engine/core/module/index.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
export type RaceFields = { quadruped: boolean; speedIgnoresEncumbrance: boolean };

/** The property types a race's fields are stored as. */
export const RACE_FIELD_PROPERTY_TYPES = [RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE];

/** A race's fields, read off the rows of its properties: each is true when its property says so. */
export function readRaceFields(properties: { type: string; value: string }[]): RaceFields {
  const isSet = (type: string) => properties.some((property) => property.type === type && property.value === "true");
  return { quadruped: isSet(RACE_QUADRUPED), speedIgnoresEncumbrance: isSet(RACE_SPEED_IGNORES_ENCUMBRANCE) };
}

/**
 * A race's fields as the properties that keep them, one for each that's true: a race without one is a biped whose
 * armor and load slow it.
 */
export function toRaceProperties(fields: RaceFields): PropertyValue[] {
  return [
    ...(fields.quadruped ? [{ type: RACE_QUADRUPED, value: "true" }] : []),
    ...(fields.speedIgnoresEncumbrance ? [{ type: RACE_SPEED_IGNORES_ENCUMBRANCE, value: "true" }] : []),
  ];
}
