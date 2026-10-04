import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

export interface InventoryHooks {
  /** Refuses an item held in a hand slot it can't be wielded in: a two-handed weapon in one hand. */
  validateWeaponHands(tx: Db, rulesetData: CachedRulesetData, itemId: string, location: string): Promise<void>;
}
