import type { PropertyValue } from "@/engine/core/module/index.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

/** A class's fields its properties hold: the ability its bonus spells and spell DCs use, and the spells it casts. */
export type ClassFields = { bonusSpellAbilityId: string | null; casterType: "Arcane" | "Divine" | null };

/**
 * A class's fields, read off the rows of its properties: each from the first row of its type (the seeds write
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

/** A class's fields as the properties that keep them, one for each field it has: what the seeds store. */
export function toClassProperties(fields: ClassFields): PropertyValue[] {
  const property = (type: string, value: string): PropertyValue => ({ type, value });
  return [
    ...(fields.bonusSpellAbilityId ? [property(KLASS_BONUS_SPELL_ABILITY_ID, fields.bonusSpellAbilityId)] : []),
    ...(fields.casterType ? [property(KLASS_CASTER_TYPE, fields.casterType)] : []),
  ];
}
