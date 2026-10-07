import { getTableName } from "drizzle-orm";

import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, CharacterInventory, Items, Visibility } from "@/server/repositories/index.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import { isHandLocation } from "@/shared/equipment.ts";
import type { Session } from "@/shared/relations.ts";

import { validateCharges, validateEquipping } from "./validation.ts";

class CharacterInventoryService {
  /** An inventory entry's stored placement and charges: only an equipped item has a location, only a held one a set. */
  private entryFields(
    equipped: boolean,
    location: ItemLocation | null,
    weaponSet: number | null,
    totalCharges: number | null,
    remainingCharges: number | null,
  ) {
    const resolvedLocation = equipped ? (location ?? null) : null;
    const resolvedEquipped = !!resolvedLocation;
    return {
      equipped: resolvedEquipped,
      location: resolvedLocation,
      weaponSet: resolvedEquipped && isHandLocation(resolvedLocation) ? weaponSet : null,
      totalCharges: totalCharges ?? null,
      remainingCharges: remainingCharges ?? null,
    };
  }

  async addItem(
    session: Session,
    characterId: string,
    itemId: string,
    quantity: number,
    equipped: boolean,
    location: ItemLocation | null,
    totalCharges: number | null,
    remainingCharges: number | null,
    weaponSet: number | null,
    force: boolean = false,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const { rulesetData } = scope;
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
        const validRulesetIds = new Set([characterRecord.rulesetId, ...rulesetData.cow.sourceChain]);
        if (!validRulesetIds.has(itemRecord.rulesetId)) {
          throw new BadRequestError("Item does not belong to the character's ruleset");
        }

        validateCharges(totalCharges, remainingCharges);

        // An item already carried takes another entry: a second dagger, held in the other hand
        if (equipped && location) {
          const entry = { id: null, item: itemRecord };
          await validateEquipping(tx, characterRecord, entry, location, weaponSet, force, scope);
        }

        const rows = await CharacterInventory.create(tx, {
          characterId,
          itemId,
          quantity,
          ...this.entryFields(equipped, location, weaponSet, totalCharges, remainingCharges),
        });

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(inventoryInCharacter),
          type: "addItem",
        });

        return rows[0];
      });
    });
  }

  async getInventory(session: Session, characterId: string) {
    // Visibility.All: an archived character's sheet still lists its items, read-only.
    const characterRecord = await getEditableCharacter(db, session, characterId, Visibility.All);

    return await withRulesetScope(db, characterRecord.rulesetId, async ({ rulesetData }) => {
      // Inside withRulesetScope: CharacterInventory.findMany auto-resolves
      // row.itemId to post-COW, and rulesetData id Maps are cow-resolving
      // wrappers. No manual canonicalize anywhere below.
      const inventory = await CharacterInventory.findMany(db, { characterId });
      if (inventory.length === 0) return [];

      return inventory.map((entry) => {
        // The join still contains the stored parent row after itemId resolves.
        const item = rulesetData.itemsById.get(entry.itemId) ?? entry.itemsInRule;
        const ownProperties = rulesetData.propertiesByEntity.get(item.id) ?? [];
        const ownPropertyTypes = new Set(ownProperties.map((p) => p.type));
        const templateProperties = item.sourceItemId
          ? (rulesetData.propertiesByEntity.get(item.sourceItemId) ?? []).filter((p) => !ownPropertyTypes.has(p.type))
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
  }

  async removeItem(session: Session, characterId: string, entryId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async () => {
        const existing = await CharacterInventory.findOne(tx, { characterId, id: entryId });
        if (!existing) {
          throw new NotFoundError("Item not in inventory");
        }

        await CharacterInventory.delete(tx, { characterId, id: entryId });

        await Activities.create(tx, {
          userId: session.userId,
          targetId: characterId,
          targetTable: getTableName(inventoryInCharacter),
          type: "removeItem",
        });

        return { success: true };
      });
    });
  }

  async updateItem(
    session: Session,
    characterId: string,
    entryId: string,
    quantity: number,
    equipped: boolean,
    location: ItemLocation | null,
    totalCharges: number | null,
    remainingCharges: number | null,
    weaponSet: number | null,
    force: boolean = false,
    expectedUpdatedAt?: string,
  ) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const { rulesetData } = scope;
        const existing = await CharacterInventory.findOne(tx, { characterId, id: entryId });
        if (!existing) {
          throw new NotFoundError("Item not in inventory");
        }

        validateCharges(totalCharges, remainingCharges);

        if (equipped && location) {
          const itemRecord = rulesetData.itemsById.get(existing.itemId);
          if (!itemRecord) {
            throw new NotFoundError("Item not found");
          }
          const entry = { id: entryId, item: itemRecord };
          await validateEquipping(tx, characterRecord, entry, location, weaponSet, force, scope);
        }

        const rows = await CharacterInventory.update(
          tx,
          { quantity, ...this.entryFields(equipped, location, weaponSet, totalCharges, remainingCharges) },
          { characterId, id: entryId, expectedUpdatedAt },
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
  }
}

export default new CharacterInventoryService();
