import type { PowerFields } from "@/engine/rulesets/dnd3.5/module/index.ts";
import type { PropertyRecord } from "@/engine/rulesets/dnd3.5/types.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/shared/dnd3.5/properties/index.ts";

/** A power's fields that hold one value each, by the property type that stores it, in the order its rows are written. */
const SINGLE_FIELD_TYPES = [
  ["school", SPELL_SCHOOL],
  ["subschool", SPELL_SUBSCHOOL],
  ["castingTime", SPELL_CASTING_TIME],
  ["rangeType", SPELL_RANGE_TYPE],
  ["target", SPELL_TARGET],
  ["areaOfEffect", SPELL_AREA_OF_EFFECT],
  ["duration", SPELL_DURATION],
  ["spellResistance", SPELL_RESISTANCE],
] as const;

/** The property types a power's fields are stored as. */
export const POWER_FIELD_PROPERTY_TYPES = [
  ...SINGLE_FIELD_TYPES.map(([, type]) => type),
  SPELL_DESCRIPTOR,
  SPELL_COMPONENT,
];

/**
 * A power's fields, read off the rows of its properties in one pass: each from the first row of its type, none
 * without one, and the descriptors and components all of theirs, in their rows' order.
 */
export function readPowerFields(properties: { type: string; value: string }[]): PowerFields {
  const components: string[] = [];
  const descriptors: string[] = [];
  const fields: PowerFields = { components, descriptors };
  for (const { type, value } of properties) {
    if (type === SPELL_COMPONENT) components.push(value);
    if (type === SPELL_DESCRIPTOR) descriptors.push(value);
    const single = SINGLE_FIELD_TYPES.find(([, fieldType]) => fieldType === type);
    if (single) fields[single[0]] ??= value;
  }
  return fields;
}

/**
 * A power's fields as the rows of its properties, what its effects store: a row per field with a value, one per
 * descriptor and component, and none at all without a school (a power that isn't a spell has none).
 */
export function toPowerProperties(powerId: string, fields: PowerFields): PropertyRecord[] {
  if (!fields.school) return [];
  const row = (type: string, value: string): PropertyRecord => ({
    entityId: powerId,
    entityType: "powers",
    type,
    value,
  });
  return [
    ...SINGLE_FIELD_TYPES.flatMap(([field, type]) => (fields[field] ? [row(type, fields[field])] : [])),
    ...(fields.descriptors ?? []).map((descriptor) => row(SPELL_DESCRIPTOR, descriptor)),
    ...(fields.components ?? []).map((component) => row(SPELL_COMPONENT, component)),
  ];
}
