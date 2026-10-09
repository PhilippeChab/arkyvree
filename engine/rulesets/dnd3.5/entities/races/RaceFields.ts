import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
type RaceFieldValues = { quadruped: boolean; speedIgnoresEncumbrance: boolean };

/** A race's fields, read off its properties. */
export default class RaceFields {
  /** A race's fields, read off the rows of its properties: each is true when its property says so. */
  static read(properties: { type: string; value: string }[]): RaceFieldValues {
    const isSet = (type: string) => properties.some((property) => property.type === type && property.value === "true");
    return { quadruped: isSet(RACE_QUADRUPED), speedIgnoresEncumbrance: isSet(RACE_SPEED_IGNORES_ENCUMBRANCE) };
  }
}
