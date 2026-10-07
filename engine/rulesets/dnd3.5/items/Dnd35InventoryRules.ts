import type { InventoryRules, WeaponFields } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";

import { readItemFields } from "./itemFields.ts";
import { SIZE_ORDER } from "./slots.ts";

export class Dnd35InventoryRules implements InventoryRules {
  /** The weapon fields of an item, its own merged with its template's. */
  private weaponFields(rulesetData: RulesetData, itemId: string): WeaponFields {
    const item = rulesetData.itemsById.get(itemId) ?? { id: itemId, sourceItemId: null };
    return readItemFields(rulesetData.itemProperties(item)).weapon;
  }

  /** A weapon whose one-hand training is true, its own or its template's: a bastard sword, a dwarven waraxe. */
  isUnwieldyInOneHand(rulesetData: RulesetData, itemId: string): boolean {
    return this.weaponFields(rulesetData, itemId).oneHandTraining === true;
  }

  /**
   * A weapon's WEAPON_SIZE is its effort as the weapon table gives it for a Medium wielder: Tiny and Small are light,
   * Medium one-handed, Large two-handed (a bow too: it needs both hands, whatever its size). Every weapon is sized for
   * its wielder, as its damage is, so a halfling's longsword is one-handed as a human's is, and its greatsword
   * two-handed.
   */
  validateWeaponHands(rulesetData: RulesetData, itemId: string, location: string): void {
    const weaponSize = this.weaponFields(rulesetData, itemId).size;
    const sizeIndex = weaponSize === null ? undefined : SIZE_ORDER[weaponSize];
    if (sizeIndex !== undefined && sizeIndex > SIZE_ORDER.Medium && location !== "Two Handed")
      throw new RulesError("invalid", "This weapon requires two hands");
  }
}
