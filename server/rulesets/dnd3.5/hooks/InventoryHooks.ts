import type { Db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { InventoryHooks } from "@/server/rulesets/hooks/InventoryHooks.ts";
import { WEAPON_SIZE } from "@/server/rulesets/dnd3.5/properties/index.ts";
import { SIZE_ORDER } from "@/server/rulesets/properties/index.ts";

export class Dnd35InventoryHooks implements InventoryHooks {
  async validateWeaponSize(
    _tx: Db,
    rulesetData: CachedRulesetData,
    itemId: string,
    raceId: string,
    location: string,
  ): Promise<void> {
    const item = rulesetData.itemsById.get(itemId);
    const ownProps = rulesetData.propertiesByEntity.get(itemId) ?? [];
    const templateProps = item?.sourceItemId
      ? rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []
      : [];
    const weaponSizeProp = ownProps.find((p) => p.type === WEAPON_SIZE)
      ?? templateProps.find((p) => p.type === WEAPON_SIZE);
    if (!weaponSizeProp) return;

    const race = rulesetData.racesById.get(raceId);
    if (!race) return;

    const weaponSizeIndex = SIZE_ORDER[weaponSizeProp.value];
    const characterSizeIndex = SIZE_ORDER[race.size];
    if (weaponSizeIndex === undefined || characterSizeIndex === undefined) return;

    const sizeDiff = weaponSizeIndex - characterSizeIndex;
    if (sizeDiff >= 2) {
      throw new BadRequestError("Weapon is too large for this character");
    }
    if (sizeDiff === 1 && location !== "Two Handed") {
      throw new BadRequestError("This weapon requires two hands for a character of this size");
    }
  }
}
