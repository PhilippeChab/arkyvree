import { Field, FieldCodec, type FieldValues } from "@/engine/core/fields/index.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** A feat's fields' values. */
export type FeatFieldValues = FieldValues<typeof FEAT_FIELDS.fields>;

/**
 * A feat's fields its properties hold: the families it's in (a feat can be in two), the weapon rules it changes, and
 * the schools it forbids (a specialist wizard's). Read off several feats' rows at once, they're all of theirs.
 */
export const FEAT_FIELDS = new FieldCodec({
  families: Field.list(FEAT_FAMILY),
  oversizedTwoWeaponFighting: Field.flag(FEAT_OVERSIZED_TWO_WEAPON_FIGHTING),
  prohibitedSchools: Field.list(WIZARD_PROHIBITED_SCHOOL),
  weaponFinesse: Field.flag(FEAT_WEAPON_FINESSE),
});
