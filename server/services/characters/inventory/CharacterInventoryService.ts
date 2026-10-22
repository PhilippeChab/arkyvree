import { getTableName } from "drizzle-orm";

import { inventoryInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, CharacterInventory, Visibility } from "@/server/repositories/index.ts";
import { readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { getEditableCharacter, lockEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import type { ItemLocation } from "@/shared/enums.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterInventoryService {
  async addItem(
    session: Session,
    characterId: string,
    itemId: string,
    quantity: number,
    equipped: boolean,
    location: ItemLocation | null,
    // Neither named: the item's own
    totalCharges: number | null | undefined,
    remainingCharges: number | null | undefined,
    weaponSets: number[] | undefined,
    force: boolean = false,
  ) {
    return await withTransaction(async (tx) => {
      // Locked: an entry's place is checked against the others, which a concurrent write could take
      const characterRecord = await lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const character = await readCharacterInput(tx, characterRecord);
        const request = { equipped, location, remainingCharges, totalCharges, weaponSets };
        // The item the view shows for the id sent (a copy's, when the ruleset copied it), refused when it shows none
        const fields = Engine.for(scope).character(character).planInventoryEntry({ itemId, request }, force);
        const rows = await CharacterInventory.create(tx, { characterId, quantity, ...fields });

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

    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const inventory = await CharacterInventory.findMany(db, { characterId });
      return Engine.for(scope).characters().describeInventory(inventory);
    });
  }

  /**
   * Why `location` (in each of `weaponSets`, stored from 0, for a hand) can't take one more of the character's items, if
   * it can't: what its inventory dialogs warn of before a save refuses it, the entry placed (`entryId`, none for a new
   * one) aside.
   */
  async getPlacement(
    session: Session,
    characterId: string,
    entryId: string | null,
    location: ItemLocation,
    weaponSets: number[],
  ) {
    const characterRecord = await getEditableCharacter(db, session, characterId);

    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, characterRecord);
      return Engine.for(scope).character(character).describePlacement({ entryId, location, weaponSets });
    });
  }

  async removeItem(session: Session, characterId: string, entryId: string) {
    return await withTransaction(async (tx) => {
      const characterRecord = await getEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async () => {
        const existing = await CharacterInventory.findOne(tx, { characterId, id: entryId });
        if (!existing) throw new NotFoundError("Item not in inventory");

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
    weaponSets: number[] | undefined,
    force: boolean = false,
    expectedUpdatedAt?: string,
  ) {
    return await withTransaction(async (tx) => {
      // Locked: an entry's place is checked against the others, which a concurrent write could take
      const characterRecord = await lockEditableCharacter(tx, session, characterId);

      return await withRulesetScope(tx, characterRecord.rulesetId, async (scope) => {
        const existing = await CharacterInventory.findOne(tx, { characterId, id: entryId });
        if (!existing) throw new NotFoundError("Item not in inventory");
        // An entry saved since its edit read it is refused before its edit is checked against it
        if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt)
          throw new ConflictError(STALE_ENTITY_MESSAGE);

        const character = await readCharacterInput(tx, characterRecord);
        const request = { equipped, location, remainingCharges, totalCharges, weaponSets };
        const fields = Engine.for(scope).character(character).planInventoryEntry({ entry: existing, request }, force);

        const rows = await CharacterInventory.update(
          tx,
          { quantity, ...fields },
          { characterId, id: entryId, expectedUpdatedAt },
        );
        if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

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
