/** What equipping an item checks: the slot takes it, its hands can wield it, and the character meets its requirements. */

import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { SIZE_ORDER } from "@/engine/rulesets/dnd3.5/model/inventory/InventorySlots.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/model/inventory/ItemPlacement.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Item } from "@/shared/relations.ts";
import { ITEM_TYPE_LOCATIONS, MAX_FINGER_ITEMS, SINGLE_OCCUPANCY_LOCATIONS } from "@/vocabulary/dnd3.5/equipment.ts";

/** An inventory entry an item is equipped from: the entry (null for a new one), and its item. */
interface EquippedEntry {
  id: string | null;
  item: Pick<Item, "id" | "isTemplate" | "sourceItemId" | "type">;
}

/** An equipped entry of the character's, as the slot rules read it. */
type HeldEntry = CharacterInput["rows"]["inventory"][number];

/**
 * What keeps a location from taking one more item, with the entry in the way:
 * - `occupied`: a location that holds one item holds `entry`;
 * - `fingers`: both fingers are taken;
 * - `hands`: a two-handed item can't go where `entry` is in a hand of the same weapon set;
 * - `twoHanded`: a hand can't take an item while `entry` is two-handed in the same set;
 * - `sameHand`: `entry` is already in that hand in the same set.
 */
type SlotConflict = { entry: HeldEntry; reason: Exclude<SlotConflictReason, "fingers"> } | { reason: "fingers" };

type SlotConflictReason = "occupied" | "fingers" | "hands" | "twoHanded" | "sameHand";

/** Why every finger is taken. */
const FINGERS_TAKEN_MESSAGE = "Both finger slots are occupied";

/** Why a location can't take an item, by the conflict's reason: the item in the way (`name`), its weapon set from 1. */
const SLOT_CONFLICT_MESSAGES: Record<
  Exclude<SlotConflictReason, "fingers">,
  (location: ItemLocation, entry: { location: string | null; name: string }, weaponSet: number) => string
> = {
  occupied: (location, entry) => `${location} slot is occupied by ${entry.name}`,
  hands: (_, entry, weaponSet) => `Cannot equip two-handed: ${entry.name} is in ${entry.location} (Set ${weaponSet})`,
  twoHanded: (_, entry, weaponSet) => `Cannot equip: ${entry.name} is two-handed in Set ${weaponSet}`,
  sameHand: (location, entry, weaponSet) => `${location} is occupied by ${entry.name} (Set ${weaponSet})`,
};

/** Why an item of a type that sets its locations can't go elsewhere. */
const TYPE_LOCATION_MESSAGES = {
  Armor: "Body armor can only be equipped in the Torso slot",
  Shield: "Shields can only be equipped in the Off Hand slot",
  Weapon: "Weapons can only be equipped in hand slots",
} as const satisfies Record<keyof typeof ITEM_TYPE_LOCATIONS, string>;

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
    const conflict = this.describeConflict(id, location, weaponSet);
    if (conflict) throw new RulesError("invalid", conflict);

    if (ItemPlacement.isLocatedType(item.type) && !isOneOf(location, ITEM_TYPE_LOCATIONS[item.type]))
      throw new RulesError("invalid", TYPE_LOCATION_MESSAGES[item.type]);
    if (ItemPlacement.isHand(location)) this.checkWeaponHands(item.id, location);
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
    if (item.type !== "Weapon" || !ItemPlacement.isHand(location) || location === "Two Handed") return;
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

  /** What keeps `location` (in `weaponSet`, stored from 0, for a hand) from taking an item, given the `equipped` entries. */
  private findConflict(location: ItemLocation, weaponSet: number | null, equipped: HeldEntry[]): SlotConflict | null {
    if (isOneOf(location, SINGLE_OCCUPANCY_LOCATIONS)) {
      const entry = equipped.find((e) => e.location === location);
      if (entry) return { reason: "occupied", entry };
    }

    if (location === "Finger" && equipped.filter((e) => e.location === "Finger").length >= MAX_FINGER_ITEMS)
      return { reason: "fingers" };

    if (ItemPlacement.isHand(location)) {
      const sameSet = equipped.filter((e) => ItemPlacement.isHand(e.location) && e.weaponSet === weaponSet);
      const find = (...locations: string[]) =>
        sameSet.find((e) => e.location !== null && locations.includes(e.location));

      const handed = location === "Two Handed" ? find("Main Hand", "Off Hand") : undefined;
      if (handed) return { reason: "hands", entry: handed };
      const twoHanded = location === "Two Handed" ? undefined : find("Two Handed");
      if (twoHanded) return { reason: "twoHanded", entry: twoHanded };
      const same = find(location);
      if (same) return { reason: "sameHand", entry: same };
    }

    return null;
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
    if (ItemPlacement.isHand(location) && weaponSet === null)
      throw new RulesError("invalid", "A weapon set is required when equipping to a hand slot");
    this.checkSlot(entry, location, weaponSet);
    if (force) return;
    this.checkItemRequirements(entry.item);
    this.checkWeaponInOneHand(entry.item, location);
  }

  /**
   * Why `location` (in `weaponSet`, stored from 0, for a hand) can't take one more item, if it can't: an entry in the
   * way, named, the entry placed (`entryId`, none for a new one) aside. The inventory dialogs warn of it, and the save
   * refuses it.
   */
  describeConflict(entryId: string | null, location: ItemLocation, weaponSet: number | null): string | null {
    const equipped = this.input.rows.inventory.filter((other) => other.equipped && other.id !== entryId);
    const conflict = this.findConflict(location, weaponSet, equipped);
    if (!conflict) return null;
    if (conflict.reason === "fingers") return FINGERS_TAKEN_MESSAGE;

    const { entry } = conflict;
    const name = this.view.rulesetData.itemsById.get(entry.itemId)?.name ?? entry.itemsInRule.name;
    return SLOT_CONFLICT_MESSAGES[conflict.reason](
      location,
      { location: entry.location, name },
      (entry.weaponSet ?? 0) + 1,
    );
  }
}
