import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, CharacterInventory } from "@/server/repositories/index.ts";
import { readCharacterInput } from "@/server/services/characters/characterInputs.ts";
import { getRowEditableCharacter, getRowReadableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withCharacterWrite, withLockedCharacter } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterInventoryService {
  async addItem(
    session: Session,
    characterId: string,
    itemId: string,
    quantity: number,
    location: string | null,
    totalCharges: number | null,
    remainingCharges: number | null,
    groups: number[],
    force: boolean = false,
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const character = await readCharacterInput(tx, characterRecord);
      const request = { location, quantity, remainingCharges, totalCharges, groups };
      // The item the view shows for the id sent (a copy's, when the ruleset copied it), refused when it shows none
      const fields = Engine.for(scope).character(character).planInventoryEntry({ itemId, request }, force);
      const rows = await CharacterInventory.create(tx, scope.ruleset.baseRules, { ...fields, characterId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "addItem",
      });

      return rows[0];
    });
  }

  /** One of a character's entries, as its inventory lists it (`getInventory`): refused when it has none of that id. */
  async getEntry(session: Session, characterId: string, entryId: string) {
    const characterRecord = await getRowReadableCharacter(db, session, characterId);

    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const entry = await CharacterInventory.findOne(db, { characterId, id: entryId });
      const [described] = entry ? Engine.for(scope).characters().describeInventory([entry]) : [];
      if (!described) throw new NotFoundError("Inventory entry not found");
      return described;
    });
  }

  async getInventory(session: Session, characterId: string) {
    // An archived character's sheet still lists its items, read-only
    const characterRecord = await getRowReadableCharacter(db, session, characterId);

    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const inventory = await CharacterInventory.findMany(db, { characterId });
      return Engine.for(scope).characters().describeInventory(inventory);
    });
  }

  /**
   * Why `location` (in each of `groups`, stored from 0, for a hand) can't take one more of the character's items, if
   * it can't: what its inventory dialogs warn of before a save refuses it, the entry placed (`entryId`, none for a new
   * one) aside.
   */
  async getPlacement(
    session: Session,
    characterId: string,
    entryId: string | null,
    location: string,
    groups: number[],
  ) {
    const characterRecord = await getRowEditableCharacter(db, session, characterId);

    return await withRulesetScope(db, characterRecord.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, characterRecord);
      return Engine.for(scope).character(character).describePlacement({ entryId, location, groups });
    });
  }

  async removeItem(session: Session, characterId: string, entryId: string) {
    // Archived or not: an archived one is its policy's to refuse
    return await withLockedCharacter(session, characterId, async (tx, policy) => {
      policy.canEditRows();
      const existing = await CharacterInventory.findOne(tx, { characterId, id: entryId });
      if (!existing) throw new NotFoundError("Item not in inventory");

      await CharacterInventory.delete(tx, { characterId, id: entryId });

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "removeItem",
      });

      return { success: true };
    });
  }

  async updateItem(
    session: Session,
    characterId: string,
    entryId: string,
    quantity: number,
    location: string | null,
    totalCharges: number | null,
    remainingCharges: number | null,
    groups: number[],
    force: boolean = false,
    expectedUpdatedAt?: string,
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, characterRecord) => {
      const existing = await CharacterInventory.findOne(tx, { characterId, id: entryId });
      if (!existing) throw new NotFoundError("Item not in inventory");

      const character = await readCharacterInput(tx, characterRecord);
      const request = { location, quantity, remainingCharges, totalCharges, groups };
      const fields = Engine.for(scope).character(character).planInventoryEntry({ entry: existing, request }, force);

      const where = { characterId, id: entryId, expectedUpdatedAt };
      const rows = await CharacterInventory.update(tx, scope.ruleset.baseRules, fields, where);
      if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      await Activities.create(tx, {
        userId: session.userId,
        targetId: characterId,
        targetType: TARGET_TYPES.characters,
        type: "updateItem",
      });

      return rows[0];
    });
  }
}

export default new CharacterInventoryService();
