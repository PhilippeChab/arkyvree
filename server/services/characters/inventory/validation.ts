/**
 * Equipment slot and requirement validation for character inventory.
 *
 * - validateEquipmentSlot — enforces slot occupancy, hand conflicts, weapon size rules
 * - validateItemRequirements — checks character meets item requirements before equipping
 * - validateCharges / validateEquipping — what adding or updating an inventory entry checks
 */

import type { RulesetData, RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { CharacterInventory } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { findSlotConflict, isHandLocation, MAX_FINGER_ITEMS, type SlotConflictReason } from "@/shared/equipment.ts";
import type { Character as CharacterRecord, Ruleset } from "@/shared/relations.ts";

/** Why an item can't be equipped at a location, by the slot conflict's reason. */
const SLOT_CONFLICT_MESSAGES: Record<SlotConflictReason, (location: ItemLocation) => string> = {
  occupied: (location) => `Equipment slot "${location}" is already occupied`,
  fingers: () => `Cannot equip more than ${MAX_FINGER_ITEMS} rings`,
  hands: () => "Cannot equip a two-handed item while holding items in Main Hand or Off Hand in the same weapon set",
  twoHanded: () => "Cannot equip in hand slot while holding a two-handed item in the same weapon set",
  sameHand: (location) => `"${location}" is already occupied in this weapon set`,
};

async function validateEquipmentSlot(
  tx: Db,
  characterId: string,
  entry: { id: string | null; item: { id: string; type: string | null } },
  location: ItemLocation,
  weaponSet: number | null,
  ruleset: Ruleset,
  rulesetData: RulesetData,
) {
  // The other entries: the item's own other ones count (a dagger in the other hand), the one being edited doesn't
  const inventory = await CharacterInventory.findMany(tx, { characterId });
  const equippedItems = inventory.filter((other) => other.equipped && other.id !== entry.id);
  const { item } = entry;

  const conflict = findSlotConflict(location, weaponSet, equippedItems);
  if (conflict) throw new BadRequestError(SLOT_CONFLICT_MESSAGES[conflict.reason](location));

  if (item.type === "Weapon" && !isHandLocation(location))
    throw new BadRequestError("Weapons can only be equipped in hand slots");

  if (item.type === "Armor" && location !== "Torso")
    throw new BadRequestError("Body armor can only be equipped in the Torso slot");

  if (item.type === "Shield" && location !== "Off Hand")
    throw new BadRequestError("Shields can only be equipped in the Off Hand slot");

  // A two-handed weapon needs both hands
  if (isHandLocation(location)) {
    const { rules } = RulesetFactory.fromBaseRules(ruleset.baseRules);
    rules.inventory.validateWeaponHands(rulesetData, item.id, location);
  }
}

async function validateItemRequirements(
  tx: Db,
  characterRecord: CharacterRecord,
  item: { id: string; type: string | null; sourceItemId: string | null },
  scope: RulesetScope,
) {
  const { ruleset, rulesetData } = scope;
  // Weapons are exempt — non-proficiency applies a -4 penalty instead of blocking equip
  if (item.type === "Weapon") return;

  // requirementsByEntity resolves its keys (RulesetComposition) — stored pre-COW ids
  // auto-resolve on lookup. No manual canonicalize needed.
  const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
  const templateRequirements = item.sourceItemId ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? []) : [];
  if (ownRequirements.length === 0 && templateRequirements.length === 0) return;

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(tx, undefined, scope);

  // Two entities' requirements, each its own group: their levels each start at "1"
  const issues = detailedCharacter.getUnmetRequirementIssues([templateRequirements, ownRequirements]);
  if (issues.length > 0)
    throw new BadRequestError("Character does not meet the requirements to equip this item", { issues });
}

/**
 * A weapon too large for one hand without training (a bastard sword) held in one: only its proficiency there lets it be
 * wielded, "as impossible as wielding a greatsword one-handed" without. Its proficiency is read in no hand, so what only
 * two hands give (a martial weapon's) doesn't count, and a race's familiarity (a dwarf's waraxe) does.
 */
async function validateWeaponInOneHand(
  tx: Db,
  characterRecord: CharacterRecord,
  item: { id: string; type: string | null; sourceItemId: string | null },
  location: ItemLocation,
  scope: RulesetScope,
) {
  const { ruleset, rulesetData } = scope;
  if (item.type !== "Weapon" || !isHandLocation(location) || location === "Two Handed") return;
  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  if (!rulesetModule.rules.inventory.isUnwieldyInOneHand(rulesetData, item.id)) return;

  // Its proficiency: its template's requirements, or its own when it's a template (`toCustomizedInventory`)
  const isTemplate = rulesetData.itemsById.get(item.id)?.isTemplate ?? false;
  const proficiencyOf = isTemplate ? item.id : item.sourceItemId;
  const proficiency = proficiencyOf ? (rulesetData.requirementsByEntity.get(proficiencyOf) ?? []) : [];
  if (proficiency.length === 0) return;

  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(tx, undefined, scope);
  if (!detailedCharacter.areRequirementsMet([proficiency], { sourceId: null })) {
    // An issue, as an unmet requirement is: the form shows it, and can equip it anyway (`force`)
    const message = "This weapon is too large to use in one hand without its proficiency";
    const entityName = rulesetData.itemsById.get(item.id)?.name;
    throw new BadRequestError(message, {
      issues: [{ category: "requirements", message, entityName, entityType: "items" }],
    });
  }
}

/** An entry's charges: both set or both null, and no more remaining than total. */
export function validateCharges(totalCharges: number | null, remainingCharges: number | null) {
  if ((totalCharges === null) !== (remainingCharges === null))
    throw new BadRequestError("Total charges and remaining charges must both be set or both be null");

  if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges)
    throw new BadRequestError("Remaining charges cannot exceed total charges");
}

/**
 * Equipping an entry's item at `location` (the entry's `id`, null for a new one): a hand slot needs its weapon set, the
 * slot must take it, and the character must meet the item's requirements unless `force`.
 */
export async function validateEquipping(
  tx: Db,
  characterRecord: CharacterRecord,
  entry: { id: string | null; item: { id: string; type: string | null; sourceItemId: string | null } },
  location: ItemLocation,
  weaponSet: number | null,
  force: boolean,
  scope: RulesetScope,
) {
  const { ruleset, rulesetData } = scope;
  if (isHandLocation(location) && weaponSet === null)
    throw new BadRequestError("A weapon set is required when equipping to a hand slot");

  const { item } = entry;
  await validateEquipmentSlot(tx, characterRecord.id, entry, location, weaponSet, ruleset, rulesetData);
  if (force) return;
  await validateItemRequirements(tx, characterRecord, item, scope);
  await validateWeaponInOneHand(tx, characterRecord, item, location, scope);
}
