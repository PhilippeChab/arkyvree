import type { PropertyValue } from "@/engine/core/module/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/shared/dnd3.5/properties/index.ts";

/** A class level's fields its properties hold: its base attack bonus and its skill points. */
export type ClassLevelFields = { bab: number; skills: number };

/** The property types a class level's fields are stored as. */
export const CLASS_LEVEL_FIELD_PROPERTY_TYPES = [KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS];

/**
 * A class level's fields, read off the rows of its properties: each from the first row of its type (a save writes
 * one), 0 without one.
 */
export function readClassLevelFields(properties: { type: string; value: string }[]): ClassLevelFields {
  const valueOf = (type: string) => properties.find((property) => property.type === type)?.value ?? 0;
  return { bab: Number(valueOf(KLASS_LEVEL_BAB)), skills: Number(valueOf(KLASS_LEVEL_SKILL_POINTS)) };
}

/** A class level's fields as the properties that keep them, both always: what a save and the seeds store. */
export function toClassLevelProperties(fields: ClassLevelFields): PropertyValue[] {
  return [
    { type: KLASS_LEVEL_BAB, value: String(fields.bab) },
    { type: KLASS_LEVEL_SKILL_POINTS, value: String(fields.skills) },
  ];
}
