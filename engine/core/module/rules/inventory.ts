import type { RulesetData } from "@/engine/core/view/index.ts";

/** The rules a character's inventory follows. */
export interface InventoryRules {
  /**
   * Whether a weapon is too large for one hand without training (a bastard sword): held there, it takes its proficiency,
   * which the equip check reads of the character.
   */
  isUnwieldyInOneHand(rulesetData: RulesetData, itemId: string): boolean;
  /** Refuses an item held in a hand slot it can't be wielded in: a two-handed weapon in one hand. */
  validateWeaponHands(rulesetData: RulesetData, itemId: string, location: string): void;
}
