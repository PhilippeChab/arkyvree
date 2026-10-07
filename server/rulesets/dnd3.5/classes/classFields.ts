import type { ClassFields } from "@/server/rulesets/engine/module/index.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

/** The property types a class's fields are stored as. */
export const CLASS_FIELD_PROPERTY_TYPES = [KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE];

/**
 * A class's fields, read off the rows of its properties: each from the first row of its type (`syncProperties` stores
 * one), and a caster type only as one of the two the engine casts by.
 */
export function readClassFields(properties: { type: string; value: string }[]): ClassFields {
  const valueOf = (type: string) => properties.find((property) => property.type === type)?.value ?? null;
  const casterType = valueOf(KLASS_CASTER_TYPE);
  return {
    bonusSpellAbilityId: valueOf(KLASS_BONUS_SPELL_ABILITY_ID),
    casterType: casterType === "Arcane" || casterType === "Divine" ? casterType : null,
  };
}
