import { Field, FieldCodec } from "@/engine/core/fields/index.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "@/shared/dnd3.5/properties/index.ts";

/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
export const RACE_FIELDS = new FieldCodec({
  quadruped: Field.flag(RACE_QUADRUPED),
  speedIgnoresEncumbrance: Field.flag(RACE_SPEED_IGNORES_ENCUMBRANCE),
});
