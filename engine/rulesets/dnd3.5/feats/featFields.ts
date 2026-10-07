import type { PropertyValue } from "@/engine/core/module/index.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/shared/dnd3.5/properties/index.ts";

/**
 * A feat's fields its properties hold: the families it's in, the weapon rules it changes, and the spell schools it
 * forbids (a specialist wizard's).
 */
export type FeatFields = {
  families: string[];
  oversizedTwoWeaponFighting: boolean;
  prohibitedSchools: string[];
  weaponFinesse: boolean;
};

/** The property types a feat's fields are stored as. */
export const FEAT_FIELD_PROPERTY_TYPES = [
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
];

/** The fields of a feat with none of its properties: in no family, changing no rule. */
export const NO_FEAT_FIELDS: FeatFields = {
  families: [],
  oversizedTwoWeaponFighting: false,
  prohibitedSchools: [],
  weaponFinesse: false,
};

/**
 * A feat's fields, read off the rows of its properties: a family and a prohibited school per row (a feat can be in two
 * families), and a rule it changes when its row says so. Read off several feats' rows at once, they're all of theirs.
 */
export function readFeatFields(properties: { type: string; value: string }[]): FeatFields {
  // One pass: a build reads every feat of the ruleset
  const fields: FeatFields = { ...NO_FEAT_FIELDS, families: [], prohibitedSchools: [] };
  for (const { type, value } of properties) {
    if (type === FEAT_FAMILY) fields.families.push(value);
    else if (type === WIZARD_PROHIBITED_SCHOOL) fields.prohibitedSchools.push(value);
    else if (type === FEAT_WEAPON_FINESSE) fields.weaponFinesse ||= value === "true";
    else if (type === FEAT_OVERSIZED_TWO_WEAPON_FIGHTING) fields.oversizedTwoWeaponFighting ||= value === "true";
  }
  return fields;
}

/** A feat's fields as the properties that keep them: one per family and prohibited school, one per rule it changes. */
export function toFeatProperties(fields: FeatFields): PropertyValue[] {
  const property = (type: string, value: string): PropertyValue => ({ type, value });
  return [
    ...fields.families.map((family) => property(FEAT_FAMILY, family)),
    ...(fields.oversizedTwoWeaponFighting ? [property(FEAT_OVERSIZED_TWO_WEAPON_FIGHTING, "true")] : []),
    ...fields.prohibitedSchools.map((school) => property(WIZARD_PROHIBITED_SCHOOL, school)),
    ...(fields.weaponFinesse ? [property(FEAT_WEAPON_FINESSE, "true")] : []),
  ];
}
