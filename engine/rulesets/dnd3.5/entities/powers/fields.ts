import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** A power's fields' values. */
export type PowerFieldValues = FieldValues<typeof POWER_FIELDS.fields>;

/**
 * A power's fields its properties hold: a spell's school, components, range… A power that isn't a spell (no school)
 * keeps none of them.
 */
export const POWER_FIELDS = new FieldCodec(
  {
    areaOfEffect: Field.text(SPELL_AREA_OF_EFFECT),
    castingTime: Field.text(SPELL_CASTING_TIME),
    components: Field.list(SPELL_COMPONENT),
    descriptors: Field.list(SPELL_DESCRIPTOR),
    duration: Field.text(SPELL_DURATION),
    effect: Field.text(SPELL_EFFECT),
    rangeType: Field.text(SPELL_RANGE_TYPE),
    school: Field.text(SPELL_SCHOOL),
    spellResistance: Field.text(SPELL_RESISTANCE),
    subschool: Field.text(SPELL_SUBSCHOOL),
    target: Field.text(SPELL_TARGET),
  },
  { storesWhen: (fields) => !!fields.school },
);
