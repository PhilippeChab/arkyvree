/**
 * Equipment slot and requirement validation for character inventory.
 *
 * - validateEquipmentSlot — enforces slot occupancy, hand conflicts, weapon size rules
 * - validateItemRequirements — checks character meets item requirements before equipping
 * - validateCharges / validateEquipping — what adding or updating an inventory entry checks
 */

import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
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
  item: { id: string; type: string | null },
  location: ItemLocation,
  weaponSet: number | null,
  raceId: string,
  ruleset: Ruleset,
  rulesetData: CachedRulesetData,
) {
  // Caller runs us inside a withRulesetScope — CharacterInventory.findMany
  // auto-resolves row.itemId to post-COW via the repo Proxy, and `item.id`
  // is auto-canonicalized at the Items.findOne call site, so equality
  // self-exclusion works directly.
  const inventory = await CharacterInventory.findMany(tx, { characterId });
  const equippedItems = inventory.filter((entry) => entry.equipped && entry.itemId !== item.id);

  const conflict = findSlotConflict(location, weaponSet, equippedItems);
  if (conflict) throw new BadRequestError(SLOT_CONFLICT_MESSAGES[conflict.reason](location));

  if (item.type === "Weapon" && !isHandLocation(location)) {
    throw new BadRequestError("Weapons can only be equipped in hand slots");
  }
  if (item.type === "Armor" && location !== "Torso") {
    throw new BadRequestError("Body armor can only be equipped in the Torso slot");
  }
  if (item.type === "Shield" && location !== "Off Hand") {
    throw new BadRequestError("Shields can only be equipped in the Off Hand slot");
  }

  // What's held must suit the character's size
  if (isHandLocation(location)) {
    const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
    await hooks.inventory.validateWeaponSize(tx, rulesetData, item.id, raceId, location);
  }
}

async function validateItemRequirements(
  tx: Db,
  characterRecord: CharacterRecord,
  item: { id: string; type: string | null; sourceItemId: string | null },
  ruleset: Ruleset,
  rulesetData: CachedRulesetData,
) {
  // Weapons are exempt — non-proficiency applies a -4 penalty instead of blocking equip
  if (item.type === "Weapon") return;

  // requirementsByEntity is wrapped by cowResolvingMap — stored pre-COW ids
  // auto-resolve on lookup. No manual canonicalize needed.
  const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
  const templateRequirements = item.sourceItemId ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? []) : [];
  const requirements = [...templateRequirements, ...ownRequirements];
  if (requirements.length === 0) return;

  const rulesetModule = RulesetFactory.fromBaseRules(ruleset.baseRules);
  const detailedCharacter = rulesetModule.createDetailedCharacter(characterRecord);
  await detailedCharacter.build(tx);

  const issues = detailedCharacter.getUnmetRequirementIssues([requirements]);
  if (issues.length > 0) {
    throw new BadRequestError("Character does not meet the requirements to equip this item", { issues });
  }
}

/** An entry's charges: both set or both null, and no more remaining than total. */
export function validateCharges(totalCharges: number | null, remainingCharges: number | null) {
  if ((totalCharges === null) !== (remainingCharges === null)) {
    throw new BadRequestError("Total charges and remaining charges must both be set or both be null");
  }
  if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges) {
    throw new BadRequestError("Remaining charges cannot exceed total charges");
  }
}

/**
 * Equipping `item` at `location`: a hand slot needs its weapon set, the slot must take it, and the character must meet
 * the item's requirements unless `force`.
 */
export async function validateEquipping(
  tx: Db,
  characterRecord: CharacterRecord,
  item: { id: string; type: string | null; sourceItemId: string | null },
  location: ItemLocation,
  weaponSet: number | null,
  force: boolean,
  ruleset: Ruleset,
  rulesetData: CachedRulesetData,
) {
  if (isHandLocation(location) && weaponSet === null) {
    throw new BadRequestError("A weapon set is required when equipping to a hand slot");
  }
  await validateEquipmentSlot(
    tx,
    characterRecord.id,
    item,
    location,
    weaponSet,
    characterRecord.raceId,
    ruleset,
    rulesetData,
  );
  if (!force) await validateItemRequirements(tx, characterRecord, item, ruleset, rulesetData);
}
