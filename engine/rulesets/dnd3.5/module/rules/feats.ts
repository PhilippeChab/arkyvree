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

/** The rules a feat follows. */
export interface FeatsRules {
  readProperties(properties: { type: string; value: string }[]): FeatFields;
}
