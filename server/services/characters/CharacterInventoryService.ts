import { inventoryInCharacter, type location } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import {
  Activities,
  CharacterInventory,
  Characters,
  Items,
} from "@/server/repositories/index.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow.ts";
import BaseService from "@/server/services/BaseService.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";
import { HAND_SLOTS, validateEquipmentSlot, validateItemRequirements } from "./inventory/validation.ts";

type InventoryLocation = (typeof location.enumValues)[number];

export const CharacterInventoryMethods = {
  async getInventory(session: Session, characterId: string) {
    const characterRecord = await Characters.findOneEditable(db, {
      id: characterId,
      userId: session.userId,
    });
    if (!characterRecord) {
      throw new NotFoundError("Character not found");
    }

    return await withRulesetScope(db, characterRecord.rulesetId, async ({ rulesetData }) => {
      // Inside withRulesetScope: CharacterInventory.findMany auto-resolves
      // row.itemId to post-COW, and rulesetData id Maps are cow-resolving
      // wrappers. No manual canonicalize anywhere below.
      const inventory = await CharacterInventory.findMany(db, { characterId });
      if (inventory.length === 0) return [];

      return inventory.map((entry) => {
        const item = entry.itemsInRule;
        const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
        const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
        const templateProperties = item.sourceItemId
          ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []).filter(
              (p) => !ownPropertyTypes.has(p.type),
            )
          : [];
        const ownRequirements = rulesetData.requirementsByEntity.get(item.id) ?? [];
        const templateRequirements = item.sourceItemId
          ? (rulesetData.requirementsByEntity.get(item.sourceItemId) ?? [])
          : [];

        return {
          ...entry,
          item: {
            ...item,
            properties: [...templateProperties, ...ownProperties],
            modifiers: rulesetData.modifiersBySource.get(item.id) ?? [],
            requirements: [...templateRequirements, ...ownRequirements],
          },
        };
      });
    });
  },

  async addItem(
    session: Session,
    characterId: string,
    itemId: string,
    quantity: number,
    equipped: boolean,
    location: InventoryLocation | null,
    totalCharges: number | null,
    remainingCharges: number | null,
    weaponSet: number | null,
    force: boolean = false,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOneEditable(tx, {
        id: characterId,
        userId: session.userId,
      });
      if (!characterRecord) {
        throw new NotFoundError("Character not found");
      }

      return await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
        // Items.findOne is used here (rather than rulesetData.itemsById) because
        // this method needs to distinguish "item doesn't exist" from "item
        // exists but belongs to an unrelated ruleset" — the cache only knows
        // the current character's ruleset chain, so both cases would return
        // undefined and collapse into one error message.
        const itemRecord = await Items.findOne(tx, { id: itemId });
        if (!itemRecord) {
          throw new NotFoundError("Item not found");
        }

        // Validate item belongs to character's ruleset or any ancestor in its
        // source chain.
        const validRulesetIds = new Set([
          characterRecord.rulesetId,
          ...rulesetData.cow.sourceChain,
        ]);
        if (!validRulesetIds.has(itemRecord.rulesetId)) {
          throw new BadRequestError("Item does not belong to the character's ruleset");
        }

        // Validate charges
        if ((totalCharges === null) !== (remainingCharges === null)) {
          throw new BadRequestError("Total charges and remaining charges must both be set or both be null");
        }
        if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges) {
          throw new BadRequestError("Remaining charges cannot exceed total charges");
        }

        const existing = await CharacterInventory.findOne(tx, { characterId, itemId });
        if (existing) {
          throw new BadRequestError("Item already in inventory");
        }

        // Require weaponSet for hand slots
        if (equipped && location && HAND_SLOTS.has(location) && weaponSet === null) {
          throw new BadRequestError("A weapon set is required when equipping to a hand slot");
        }

        // Validate equipment slot if equipped
        if (equipped && location) {
          await validateEquipmentSlot(tx, characterId, itemRecord, location, weaponSet, characterRecord.raceId, ruleset, rulesetData);
          if (!force) {
            await validateItemRequirements(tx, characterRecord, itemRecord, ruleset, rulesetData);
          }
        }

        const resolvedLocation = equipped ? (location ?? null) : null;
        const resolvedEquipped = !!resolvedLocation;
        const values = {
          characterId,
          itemId,
          quantity,
          equipped: resolvedEquipped,
          location: resolvedLocation,
          weaponSet: resolvedEquipped && resolvedLocation && HAND_SLOTS.has(resolvedLocation) ? weaponSet : null,
          totalCharges: totalCharges ?? null,
          remainingCharges: remainingCharges ?? null,
        };

        const rows = await CharacterInventory.create(tx, values);

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(inventoryInCharacter),
          type: "addItem",
        });

        return rows[0];
      });
    });
  },

  async updateItem(
    session: Session,
    characterId: string,
    itemId: string,
    quantity: number,
    equipped: boolean,
    location: InventoryLocation | null,
    totalCharges: number | null,
    remainingCharges: number | null,
    weaponSet: number | null,
    force: boolean = false,
    expectedUpdatedAt?: string,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOneEditable(tx, {
        id: characterId,
        userId: session.userId,
      });
      if (!characterRecord) {
        throw new NotFoundError("Character not found");
      }

      return await withRulesetScope(tx, characterRecord.rulesetId, async ({ ruleset, rulesetData }) => {
        const existing = await CharacterInventory.findOne(tx, { characterId, itemId });
        if (!existing) {
          throw new NotFoundError("Item not in inventory");
        }

        // Validate charges
        if ((totalCharges === null) !== (remainingCharges === null)) {
          throw new BadRequestError("Total charges and remaining charges must both be set or both be null");
        }
        if (totalCharges !== null && remainingCharges !== null && remainingCharges > totalCharges) {
          throw new BadRequestError("Remaining charges cannot exceed total charges");
        }

        // Require weaponSet for hand slots
        if (equipped && location && HAND_SLOTS.has(location) && weaponSet === null) {
          throw new BadRequestError("A weapon set is required when equipping to a hand slot");
        }

        // Validate equipment slot if equipping
        if (equipped && location) {
          const itemRecord = rulesetData.itemsById.get(itemId);
          if (!itemRecord) {
            throw new NotFoundError("Item not found");
          }
          await validateEquipmentSlot(tx, characterId, itemRecord, location, weaponSet, characterRecord.raceId, ruleset, rulesetData);
          if (!force) {
            await validateItemRequirements(tx, characterRecord, itemRecord, ruleset, rulesetData);
          }
        }

        const resolvedLocation = equipped ? (location ?? null) : null;
        const resolvedEquipped = !!resolvedLocation;
        const rows = await CharacterInventory.update(
          tx,
          {
            quantity,
            equipped: resolvedEquipped,
            location: resolvedLocation,
            weaponSet: resolvedEquipped && resolvedLocation && HAND_SLOTS.has(resolvedLocation) ? weaponSet : null,
            totalCharges: totalCharges ?? null,
            remainingCharges: remainingCharges ?? null,
          },
          { characterId, itemId, expectedUpdatedAt },
        );
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(inventoryInCharacter),
          type: "updateItem",
        });

        return rows[0];
      });
    });
  },

  async removeItem(session: Session, characterId: string, itemId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await Characters.findOneEditable(tx, {
        id: characterId,
        userId: session.userId,
      });
      if (!characterRecord) {
        throw new NotFoundError("Character not found");
      }

      return await withRulesetScope(tx, characterRecord.rulesetId, async () => {
        const existing = await CharacterInventory.findOne(tx, { characterId, itemId });
        if (!existing) {
          throw new NotFoundError("Item not in inventory");
        }

        await CharacterInventory.delete(tx, { characterId, itemId });

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(inventoryInCharacter),
          type: "removeItem",
        });

        return { success: true };
      });
    });
  },
} as const;

class CharacterInventoryService extends BaseService<typeof CharacterInventoryMethods> {
  static initialize() {
    return new CharacterInventoryService(CharacterInventoryMethods);
  }
}

export default CharacterInventoryService;
