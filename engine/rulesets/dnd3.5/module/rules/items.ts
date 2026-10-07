import type { ItemLocation } from "@/shared/enums.ts";

/**
 * An item's fields its properties hold, as stored: each null (or empty) without its row, so an item made from a
 * template holds only the fields it overrides, and what the engine does without one (a critical of 1, Strength to
 * damage by the hand) stays where the engine reads it.
 */
export type ItemFields = {
  armor: ProtectionFields;
  /** `ITEM_HAS_CHARGES`: the charges it comes with, null for an item without charges. */
  charges: number | null;
  /** `ARMOR_CHECK_PENALTY`: an armor's or a shield's. */
  checkPenalty: number | null;
  madeOf: string | null;
  magicAuras: string[];
  magicCasterLevel: number | null;
  masterwork: boolean | null;
  /** `ARMOR_MAX_DEX`: an armor's, or a tower shield's. */
  maxDex: number | null;
  shield: ProtectionFields;
  spellFailure: number | null;
  weapon: WeaponFields;
};

/** The rules an item follows. */
export interface ItemsRules {
  /** An item's fields, off its rows merged with its template's (`RulesetData.itemProperties`). */
  readProperties(properties: { type: string; value: string }[]): ItemFields;
  resolveSlot(itemType: string | null | undefined, requestedSlot: ItemLocation | undefined): ItemLocation | undefined;
}

/** An armor's or a shield's own fields: its AC bonus, the proficiency it takes and its type. */
export type ProtectionFields = { acBonus: number | null; proficiency: string | null; type: string | null };

/** A weapon's fields: what its attacks, its groupings and the hands it's held in read. */
export type WeaponFields = {
  baseDamage: string | null;
  criticalMultiplier: number | null;
  criticalRange: number | null;
  damageTypes: string[];
  doubleDamage: string | null;
  family: string | null;
  finessable: boolean | null;
  mighty: number | null;
  oneHandedPenalty: number | null;
  oneHandTraining: boolean | null;
  proficiency: string | null;
  range: number | null;
  ranged: boolean | null;
  reach: number | null;
  size: string | null;
  strengthDamage: string | null;
  type: string | null;
};
