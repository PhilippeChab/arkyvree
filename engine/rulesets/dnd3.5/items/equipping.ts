/** What equipping an item checks: the slot takes it, its hands can wield it, and the character meets its requirements. */

import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { buildCharacter } from "@/engine/rulesets/dnd3.5/character/buildCharacter.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { findSlotConflict, isHandLocation, MAX_FINGER_ITEMS, type SlotConflictReason } from "@/shared/equipment.ts";

import { readItemFields } from "./itemFields.ts";
import { SIZE_ORDER } from "./slots.ts";

/** An inventory entry an item is equipped from: the entry (null for a new one), and its item. */
interface EquippedEntry {
  id: string | null;
  item: { id: string; sourceItemId: string | null; type: string | null };
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
 * The character meets the item's requirements and its template's, each its own group. A weapon's aren't checked:
 * without its proficiency, a -4 penalty applies instead.
 */
function checkItemRequirements(view: RulesetView, character: CharacterInput, item: EquippedEntry["item"]) {
  const { rulesetData } = view;
  if (item.type === "Weapon") return;
  const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
  const templateRequirements = item.sourceItemId ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? []) : [];
  if (ownRequirements.length === 0 && templateRequirements.length === 0) return;

  // Two entities' requirements, each its own group: their levels each start at "1"
  const issues = buildCharacter(view, character).getUnmetRequirementIssues([templateRequirements, ownRequirements]);
  if (issues.length > 0)
    throw new RulesError("invalid", "Character does not meet the requirements to equip this item", issues);
}

/**
 * The slot takes the item: no other entry is in its way (the item's own other ones count, a dagger in the other hand;
 * the entry equipped doesn't), it's a slot of the item's kind, and its hands can wield a weapon.
 */
function checkSlot(
  rulesetData: RulesetData,
  character: CharacterInput,
  { id, item }: EquippedEntry,
  location: ItemLocation,
  weaponSet: number | null,
) {
  const equipped = character.rows.inventory.filter((other) => other.equipped && other.id !== id);
  const conflict = findSlotConflict(location, weaponSet, equipped);
  if (conflict) throw new RulesError("invalid", SLOT_CONFLICT_MESSAGES[conflict.reason](location));

  if (item.type === "Weapon" && !isHandLocation(location))
    throw new RulesError("invalid", "Weapons can only be equipped in hand slots");
  if (item.type === "Armor" && location !== "Torso")
    throw new RulesError("invalid", "Body armor can only be equipped in the Torso slot");
  if (item.type === "Shield" && location !== "Off Hand")
    throw new RulesError("invalid", "Shields can only be equipped in the Off Hand slot");
  if (isHandLocation(location)) checkWeaponHands(rulesetData, item.id, location);
}

/**
 * A weapon's WEAPON_SIZE is its effort as the weapon table gives it for a Medium wielder: Tiny and Small are light,
 * Medium one-handed, Large two-handed (a bow too: it needs both hands, whatever its size). Every weapon is sized for
 * its wielder, as its damage is, so a halfling's longsword is one-handed as a human's is, and its greatsword
 * two-handed.
 */
function checkWeaponHands(rulesetData: RulesetData, itemId: string, location: ItemLocation) {
  const weaponSize = weaponFields(rulesetData, itemId).size;
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
function checkWeaponInOneHand(
  view: RulesetView,
  character: CharacterInput,
  item: EquippedEntry["item"],
  location: ItemLocation,
) {
  const { rulesetData } = view;
  if (item.type !== "Weapon" || !isHandLocation(location) || location === "Two Handed") return;
  if (weaponFields(rulesetData, item.id).oneHandTraining !== true) return;

  // Its proficiency: its template's requirements, or its own when it's a template (`toCustomizedInventory`)
  const isTemplate = rulesetData.itemsById.get(item.id)?.isTemplate ?? false;
  const proficiencyOf = isTemplate ? item.id : item.sourceItemId;
  const proficiency = proficiencyOf ? (rulesetData.requirementsByEntity.get(proficiencyOf) ?? []) : [];
  if (proficiency.length === 0) return;

  if (!buildCharacter(view, character).areRequirementsMet([proficiency], { sourceId: null })) {
    // An issue, as an unmet requirement is: the form shows it, and can equip it anyway (`force`)
    const message = "This weapon is too large to use in one hand without its proficiency";
    const entityName = rulesetData.itemsById.get(item.id)?.name;
    throw new RulesError("invalid", message, [{ category: "requirements", message, entityName, entityType: "items" }]);
  }
}

/** The weapon fields of an item, its own merged with its template's. */
function weaponFields(rulesetData: RulesetData, itemId: string) {
  const item = rulesetData.itemsById.get(itemId) ?? { id: itemId, sourceItemId: null };
  return readItemFields(rulesetData.itemProperties(item)).weapon;
}

/**
 * Equipping an entry's item at `location` (in `weaponSet`, for a hand), from the character's rows: a hand slot needs
 * its weapon set, the slot must take the item, and the character must meet its requirements unless `force`d.
 */
export function checkEquipping(
  view: RulesetView,
  character: CharacterInput,
  entry: EquippedEntry,
  location: ItemLocation,
  weaponSet: number | null,
  force: boolean,
) {
  if (isHandLocation(location) && weaponSet === null)
    throw new RulesError("invalid", "A weapon set is required when equipping to a hand slot");
  checkSlot(view.rulesetData, character, entry, location, weaponSet);
  if (force) return;
  checkItemRequirements(view, character, entry.item);
  checkWeaponInOneHand(view, character, entry.item, location);
}
