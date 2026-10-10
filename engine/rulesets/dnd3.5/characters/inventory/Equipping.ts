/** What equipping an item checks: the slot takes it, its hands can wield it, and the character meets its requirements. */

import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { SIZE_ORDER } from "@/engine/rulesets/dnd3.5/model/inventory/InventorySlots.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { findSlotConflict, isHandLocation, MAX_FINGER_ITEMS, type SlotConflictReason } from "@/shared/equipment.ts";
import type { Item } from "@/shared/relations.ts";

/** An inventory entry an item is equipped from: the entry (null for a new one), and its item. */
interface EquippedEntry {
  id: string | null;
  item: Pick<Item, "id" | "isTemplate" | "sourceItemId" | "type">;
}

/** Why an item can't be equipped at a location, by the slot conflict's reason. */
const SLOT_CONFLICT_MESSAGES: Record<SlotConflictReason, (location: ItemLocation) => string> = {
  occupied: (location) => `Equipment slot "${location}" is already occupied`,
  fingers: () => `Cannot equip more than ${MAX_FINGER_ITEMS} rings`,
  hands: () => "Cannot equip a two-handed item while holding items in Main Hand or Off Hand in the same weapon set",
  twoHanded: () => "Cannot equip in hand slot while holding a two-handed item in the same weapon set",
  sameHand: (location) => `"${location}" is already occupied in this weapon set`,
};

/**
 * Equipping an item for a character, from its rows (`input`): where it holds it, refused when a slot, a hand or a
 * requirement says no. The character is built once, when a requirement first reads it.
 */
export default class Equipping {
  constructor(
    private readonly view: RulesetView,
    private readonly input: CharacterInput,
  ) {}

  /** The character, built from its rows. */
  private built?: DetailedCharacter;

  /** The character, built from its rows the first time a requirement reads it. */
  private get character() {
    return (this.built ??= Dnd35CharacterBuilder.build(this.view, this.input));
  }

  /**
   * The character meets the item's requirements and its template's, each its own group. A weapon's aren't checked:
   * without its proficiency, a -4 penalty applies instead.
   */
  private checkItemRequirements(item: EquippedEntry["item"]) {
    if (item.type === "Weapon") return;
    const { own: requirements, template: proficiency } = this.view.rulesetData.itemRequirements(item);
    if (proficiency.length === 0 && requirements.length === 0) return;

    // Two entities' requirements, each its own group: their levels each start at "1"
    const issues = this.character.getUnmetRequirementIssues([proficiency, requirements]);
    if (issues.length > 0)
      throw new RulesError("invalid", "Character does not meet the requirements to equip this item", issues);
  }

  /**
   * The slot takes the item: no other entry is in its way (the item's own other ones count, a dagger in the other hand;
   * the entry equipped doesn't), it's a slot of the item's kind, and its hands can wield a weapon.
   */
  private checkSlot({ id, item }: EquippedEntry, location: ItemLocation, weaponSet: number | null) {
    const equipped = this.input.rows.inventory.filter((other) => other.equipped && other.id !== id);
    const conflict = findSlotConflict(location, weaponSet, equipped);
    if (conflict) throw new RulesError("invalid", SLOT_CONFLICT_MESSAGES[conflict.reason](location));

    if (item.type === "Weapon" && !isHandLocation(location))
      throw new RulesError("invalid", "Weapons can only be equipped in hand slots");
    if (item.type === "Armor" && location !== "Torso")
      throw new RulesError("invalid", "Body armor can only be equipped in the Torso slot");
    if (item.type === "Shield" && location !== "Off Hand")
      throw new RulesError("invalid", "Shields can only be equipped in the Off Hand slot");
    if (isHandLocation(location)) this.checkWeaponHands(item.id, location);
  }

  /**
   * A weapon's WEAPON_SIZE is its effort as the weapon table gives it for a Medium wielder: Tiny and Small are light,
   * Medium one-handed, Large two-handed (a bow too: it needs both hands, whatever its size). Every weapon is sized for
   * its wielder, as its damage is, so a halfling's longsword is one-handed as a human's is, and its greatsword
   * two-handed.
   */
  private checkWeaponHands(itemId: string, location: ItemLocation) {
    const weaponSize = this.weaponFields(itemId).size;
    const sizeIndex = weaponSize === null ? undefined : SIZE_ORDER[weaponSize];
    if (sizeIndex !== undefined && sizeIndex > SIZE_ORDER.Medium && location !== "Two Handed")
      throw new RulesError("invalid", "This weapon requires two hands");
  }

  /**
   * A weapon too large for one hand without training (a bastard sword, a dwarven waraxe: its one-hand training is true)
   * held in one: only its proficiency there lets it be wielded, "as impossible as wielding a greatsword one-handed"
   * without. Its proficiency is read in no hand, so what only two hands give (a martial weapon's) doesn't count, and a
   * race's familiarity (a dwarf's waraxe) does.
   */
  private checkWeaponInOneHand(item: EquippedEntry["item"], location: ItemLocation) {
    const { rulesetData } = this.view;
    if (item.type !== "Weapon" || !isHandLocation(location) || location === "Two Handed") return;
    if (this.weaponFields(item.id).oneHandTraining !== true) return;

    const { template: proficiency } = rulesetData.itemRequirements(item);
    if (proficiency.length === 0) return;

    if (!this.character.areRequirementsMet([proficiency], { sourceId: null })) {
      // An issue, as an unmet requirement is: the form shows it, and can equip it anyway (`force`)
      const message = "This weapon is too large to use in one hand without its proficiency";
      const entityName = rulesetData.itemsById.get(item.id)?.name;
      throw new RulesError("invalid", message, [
        { category: "requirements", message, entityName, entityType: "items" },
      ]);
    }
  }

  /** The weapon fields of an item, its own merged with its template's. */
  private weaponFields(itemId: string) {
    const { rulesetData } = this.view;
    const item = rulesetData.itemsById.get(itemId) ?? { id: itemId, sourceItemId: null };
    return ITEM_FIELDS.read(rulesetData.itemProperties(item)).weapon;
  }

  /**
   * Equipping an entry's item at `location` (in `weaponSet`, for a hand): a hand slot needs its weapon set, the slot
   * must take the item, and the character must meet its requirements unless `force`d.
   */
  checkEquip(entry: EquippedEntry, location: ItemLocation, weaponSet: number | null, force: boolean) {
    if (isHandLocation(location) && weaponSet === null)
      throw new RulesError("invalid", "A weapon set is required when equipping to a hand slot");
    this.checkSlot(entry, location, weaponSet);
    if (force) return;
    this.checkItemRequirements(entry.item);
    this.checkWeaponInOneHand(entry.item, location);
  }
}
