import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";

export interface InventoryHooks {
  validateWeaponSize(
    tx: Db,
    rulesetData: CachedRulesetData,
    itemId: string,
    raceId: string,
    location: string,
  ): Promise<void>;
}
