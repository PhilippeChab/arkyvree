import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import type { InventoryHooks } from "@/server/rulesets/hooks/index.ts";
import { SIZE_ORDER } from "@/server/rulesets/properties/index.ts";
import { WEAPON_SIZE } from "@/shared/dnd3.5/properties/index.ts";

export class Dnd35InventoryHooks implements InventoryHooks {
  /**
   * A weapon's WEAPON_SIZE is its effort as the weapon table gives it for a Medium wielder: Tiny and Small are light,
   * Medium one-handed, Large two-handed (a bow too: it needs both hands, whatever its size). Every weapon is sized for
   * its wielder, as its damage is, so a halfling's longsword is one-handed as a human's is, and its greatsword
   * two-handed.
   */
  async validateWeaponHands(_tx: Db, rulesetData: CachedRulesetData, itemId: string, location: string): Promise<void> {
    const item = rulesetData.itemsById.get(itemId);
    const ownProps = rulesetData.propertiesByEntity.get(itemId) ?? [];
    const templateProps = item?.sourceItemId ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []) : [];
    const weaponSize = (
      ownProps.find((p) => p.type === WEAPON_SIZE) ?? templateProps.find((p) => p.type === WEAPON_SIZE)
    )?.value;
    const sizeIndex = weaponSize === undefined ? undefined : SIZE_ORDER[weaponSize];
    if (sizeIndex !== undefined && sizeIndex > SIZE_ORDER.Medium && location !== "Two Handed") {
      throw new BadRequestError("This weapon requires two hands");
    }
  }
}
