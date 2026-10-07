import type { PropertyRecord } from "@/server/rulesets/dnd3.5/types.ts";
import type { ClassLevelFields } from "@/server/rulesets/engine/module/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/shared/dnd3.5/properties/index.ts";

/** The property types a class level's fields are stored as. */
export const CLASS_LEVEL_FIELD_PROPERTY_TYPES = [KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS];

/**
 * A class level's fields, read off the rows of its properties: each from the first row of its type (the effects'
 * `properties` write one), 0 without one.
 */
export function readClassLevelFields(properties: { type: string; value: string }[]): ClassLevelFields {
  const valueOf = (type: string) => properties.find((property) => property.type === type)?.value ?? 0;
  return { bab: Number(valueOf(KLASS_LEVEL_BAB)), skills: Number(valueOf(KLASS_LEVEL_SKILL_POINTS)) };
}

/** A class level's fields as the rows of its properties, both always: what its effects and the seeds store. */
export function toClassLevelProperties(levelId: string, fields: ClassLevelFields): PropertyRecord[] {
  return [
    { entityId: levelId, entityType: "klass_levels", type: KLASS_LEVEL_BAB, value: String(fields.bab) },
    { entityId: levelId, entityType: "klass_levels", type: KLASS_LEVEL_SKILL_POINTS, value: String(fields.skills) },
  ];
}
