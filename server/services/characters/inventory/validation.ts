/**
 * Equipment slot and requirement validation for character inventory.
 *
 * - validateEquipmentSlot — enforces slot occupancy, hand conflicts, weapon size rules
 * - validateItemRequirements — checks character meets item requirements before equipping
 */

import type { location } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";
import { CharacterInventory } from "@/server/repositories/index.ts";
import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { Character as CharacterRecord, Ruleset } from "@/shared/relations.ts";

type InventoryLocation = (typeof location.enumValues)[number];

export const HAND_SLOTS = new Set<InventoryLocation>(["Main Hand", "Off Hand", "Two Handed"]);
const SINGLE_OCCUPANCY_SLOTS = new Set<InventoryLocation>([
  "Head", "Neck", "Shoulders", "Torso", "Wrists",
  "Hands", "Waist", "Trinket",
]);
const MAX_FINGER_SLOTS = 2;

export async function validateEquipmentSlot(
  tx: Db,
  characterId: string,
  item: { id: string; type: string | null },
  location: InventoryLocation,
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
  const equippedItems = inventory.filter((entry) =>
    entry.equipped && entry.itemId !== item.id
  );

  if (SINGLE_OCCUPANCY_SLOTS.has(location)) {
    const occupied = equippedItems.some((entry) => entry.location === location);
    if (occupied) {
      throw new BadRequestError(`Equipment slot "${location}" is already occupied`);
    }
  }

  if (location === "Finger") {
    const fingerCount = equippedItems.filter((entry) => entry.location === "Finger").length;
    if (fingerCount >= MAX_FINGER_SLOTS) {
      throw new BadRequestError(`Cannot equip more than ${MAX_FINGER_SLOTS} rings`);
    }
  }

  // Hand slot conflicts are per-weapon-set
  if (HAND_SLOTS.has(location)) {
    const sameSetItems = equippedItems.filter((entry) =>
      HAND_SLOTS.has(entry.location as InventoryLocation) &&
      entry.weaponSet === weaponSet
    );

    if (location === "Two Handed") {
      const hasMainHand = sameSetItems.some((entry) => entry.location === "Main Hand");
      const hasOffHand = sameSetItems.some((entry) => entry.location === "Off Hand");
      if (hasMainHand || hasOffHand) {
        throw new BadRequestError("Cannot equip a two-handed item while holding items in Main Hand or Off Hand in the same weapon set");
      }
    }

    if (location === "Main Hand" || location === "Off Hand") {
      const hasTwoHanded = sameSetItems.some((entry) => entry.location === "Two Handed");
      if (hasTwoHanded) {
        throw new BadRequestError("Cannot equip in hand slot while holding a two-handed item in the same weapon set");
      }
      const hasSameSlot = sameSetItems.some((entry) => entry.location === location);
      if (hasSameSlot) {
        throw new BadRequestError(`"${location}" is already occupied in this weapon set`);
      }
    }
  }

  // Weapon size vs character size validation for hand slots
  if (HAND_SLOTS.has(location)) {
    const hooks = RulesetFactory.fromBaseRules(ruleset.baseRules).hooks;
    await hooks.inventory.validateWeaponSize(tx, rulesetData, item.id, raceId, location);
    return;
  }

  const isWeapon = item.type === "Weapon";
  const isArmor = item.type === "Armor";
  const isShield = item.type === "Shield";

  if (isWeapon && !HAND_SLOTS.has(location)) {
    throw new BadRequestError("Weapons can only be equipped in hand slots");
  }

  if (isArmor && location !== "Torso") {
    throw new BadRequestError("Body armor can only be equipped in the Torso slot");
  }

  if (isShield && location !== "Off Hand") {
    throw new BadRequestError("Shields can only be equipped in the Off Hand slot");
  }

  // Armor: only one body armor
  if (location === "Torso" && isArmor) {
    const hasArmor = equippedItems.some((entry) => entry.location === "Torso");
    if (hasArmor) {
      throw new BadRequestError("Can only equip one body armor");
    }
  }
}

export async function validateItemRequirements(
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
  const templateRequirements = item.sourceItemId
    ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
    : [];
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
