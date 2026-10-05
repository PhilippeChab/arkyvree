import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

export interface InventoryHooks {
  /**
   * Whether a weapon is too large for one hand without training (a bastard sword): held there, it takes its proficiency,
   * which the equip check reads of the character.
   */
  isUnwieldyInOneHand(rulesetData: CachedRulesetData, itemId: string): boolean;

  /** Refuses an item held in a hand slot it can't be wielded in: a two-handed weapon in one hand. */
  validateWeaponHands(tx: Db, rulesetData: CachedRulesetData, itemId: string, location: string): Promise<void>;
}
