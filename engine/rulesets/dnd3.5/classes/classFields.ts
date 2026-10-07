import type { ClassFields } from "@/engine/rulesets/dnd3.5/module/index.ts";
import type { PropertyRecord } from "@/engine/rulesets/dnd3.5/types.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

/** The property types a class's fields are stored as. */
export const CLASS_FIELD_PROPERTY_TYPES = [KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE];

/**
 * A class's fields, read off the rows of its properties: each from the first row of its type (the effects' `properties` write
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

/** A class's fields as the rows of its properties, one for each field it has: what its effects and the seeds store. */
export function toClassProperties(klassId: string, fields: ClassFields): PropertyRecord[] {
  const property = (type: string, value: string): PropertyRecord => ({
    entityId: klassId,
    entityType: "klasses",
    type,
    value,
  });
  return [
    ...(fields.bonusSpellAbilityId ? [property(KLASS_BONUS_SPELL_ABILITY_ID, fields.bonusSpellAbilityId)] : []),
    ...(fields.casterType ? [property(KLASS_CASTER_TYPE, fields.casterType)] : []),
  ];
}
