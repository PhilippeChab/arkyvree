import type { SpellFormData } from "./SpellFormFields.tsx";

export function extractSpellFormFields(properties: { type: string; value: string }[]): Partial<SpellFormData> {
  const fields: Partial<SpellFormData> = {};

  const school = properties.find((p) => p.type === "SPELL_SCHOOL");
  if (school) fields.school = school.value;

  const subschool = properties.find((p) => p.type === "SPELL_SUBSCHOOL");
  if (subschool) fields.subschool = subschool.value;

  const castingTime = properties.find((p) => p.type === "SPELL_CASTING_TIME");
  if (castingTime) fields.castingTime = castingTime.value;

  const rangeType = properties.find((p) => p.type === "SPELL_RANGE_TYPE");
  if (rangeType) fields.rangeType = rangeType.value;

  const target = properties.find((p) => p.type === "SPELL_TARGET");
  if (target) fields.target = target.value;

  const areaOfEffect = properties.find((p) => p.type === "SPELL_AREA_OF_EFFECT");
  if (areaOfEffect) fields.areaOfEffect = areaOfEffect.value;

  const duration = properties.find((p) => p.type === "SPELL_DURATION");
  if (duration) fields.duration = duration.value;

  const spellResistance = properties.find((p) => p.type === "SPELL_RESISTANCE");
  if (spellResistance) fields.spellResistance = spellResistance.value;

  const descriptors = properties.filter((p) => p.type === "SPELL_DESCRIPTOR").map((p) => p.value);
  if (descriptors.length > 0) fields.descriptors = descriptors;

  const components = properties.filter((p) => p.type === "SPELL_COMPONENT").map((p) => p.value);
  if (components.length > 0) fields.components = components;

  return fields;
}
