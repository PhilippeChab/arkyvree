import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { SIZE_ORDER } from "@/server/rulesets/dnd3.5/items/slots.ts";
import type { InventoryRules } from "@/server/rulesets/engine/module/index.ts";
import { WEAPON_ONE_HAND_TRAINING, WEAPON_SIZE } from "@/shared/dnd3.5/properties/index.ts";

export class Dnd35InventoryRules implements InventoryRules {
  /** A weapon whose WEAPON_ONE_HAND_TRAINING is true, its own or its template's: a bastard sword, a dwarven waraxe. */
  isUnwieldyInOneHand(rulesetData: RulesetData, itemId: string): boolean {
    const item = rulesetData.itemsById.get(itemId);
    const ownProps = rulesetData.propertiesByEntity.get(itemId) ?? [];
    const templateProps = item?.sourceItemId ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []) : [];
    const training =
      ownProps.find((p) => p.type === WEAPON_ONE_HAND_TRAINING) ??
      templateProps.find((p) => p.type === WEAPON_ONE_HAND_TRAINING);
    return training?.value === "true";
  }

  /**
   * A weapon's WEAPON_SIZE is its effort as the weapon table gives it for a Medium wielder: Tiny and Small are light,
   * Medium one-handed, Large two-handed (a bow too: it needs both hands, whatever its size). Every weapon is sized for
   * its wielder, as its damage is, so a halfling's longsword is one-handed as a human's is, and its greatsword
   * two-handed.
   */
  validateWeaponHands(rulesetData: RulesetData, itemId: string, location: string): void {
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
