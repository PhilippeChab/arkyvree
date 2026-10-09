import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import {
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
} from "@/shared/dnd3.5/properties/index.ts";

/** A class's fields' values. */
export type ClassFieldValues = FieldValues<typeof CLASS_FIELDS.fields>;

/** A class level's fields' values. */
export type ClassLevelFieldValues = FieldValues<typeof CLASS_LEVEL_FIELDS.fields>;

/**
 * A class's fields its properties hold: the ability its bonus spells and spell DCs come from, and its caster type, one
 * of the two the engine casts by.
 */
export const CLASS_FIELDS = new FieldCodec({
  bonusSpellAbilityId: Field.ref(KLASS_BONUS_SPELL_ABILITY_ID),
  casterType: Field.choice(KLASS_CASTER_TYPE, ["Arcane", "Divine"] as const),
});

/**
 * A class level's fields its properties hold: its base attack bonus and its skill points, 0 without their rows, both
 * always written.
 */
export const CLASS_LEVEL_FIELDS = new FieldCodec({
  bab: Field.number(KLASS_LEVEL_BAB, { default: 0, min: 0, write: "always" }),
  skills: Field.number(KLASS_LEVEL_SKILL_POINTS, { default: 0, min: 1, write: "always" }),
});
