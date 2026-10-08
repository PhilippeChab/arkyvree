import { getTableName } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, Modifiers } from "@/server/repositories/index.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { annotateModifiers, resolvePathValueType } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterModifiersService {
  async createModifier(
    session: Session,
    characterId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return withTransaction(async (tx) => {
      const character = await getEditableCharacter(tx, session, characterId);

      const valueType = await resolvePathValueType(
        character.rulesetId,
        body.target,
        "modifier",
        body.operator,
        body.value,
        "characters",
      );

      const rows = await Modifiers.create(tx, {
        sourceId: characterId,
        sourceType: "characters",
        target: body.target,
        value: body.value,
        valueType,
        operator: body.operator,
      });
      const modifier = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifier.id,
        targetTable: getTableName(modifiersInCustomization),
        type: "createCharacterModifier",
        data: { characterName: character.name, target: body.target, value: body.value, operator: body.operator },
      });

      return modifier;
    });
  }

  async deleteModifier(session: Session, characterId: string, modifierId: string) {
    return withTransaction(async (tx) => {
      const character = await getEditableCharacter(tx, session, characterId);

      const existing = await Modifiers.findOne(tx, { id: modifierId });
      if (!existing || existing.sourceId !== characterId || existing.sourceType !== "characters")
        throw new NotFoundError("Modifier not found");

      const rows = await Modifiers.delete(tx, { ids: [modifierId] });
      const modifier = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifierId,
        targetTable: getTableName(modifiersInCustomization),
        type: "deleteCharacterModifier",
        data: {
          characterName: character.name,
          target: existing.target,
          value: existing.value,
          operator: existing.operator,
        },
      });

      return modifier;
    });
  }

  async getModifiers(session: Session, characterId: string) {
    const character = await getEditableCharacter(db, session, characterId);

    const modifiers = await Modifiers.findMany(db, { sourceIds: [characterId], sourceType: "characters" });
    return annotateModifiers(character.rulesetId, modifiers);
  }

  async updateModifier(
    session: Session,
    characterId: string,
    modifierId: string,
    body: { operator: string; target: string; updatedAt?: string; value: string },
  ) {
    return withTransaction(async (tx) => {
      const character = await getEditableCharacter(tx, session, characterId);

      const existing = await Modifiers.findOne(tx, { id: modifierId });
      if (!existing || existing.sourceId !== characterId || existing.sourceType !== "characters")
        throw new NotFoundError("Modifier not found");

      const valueType = await resolvePathValueType(
        character.rulesetId,
        body.target,
        "modifier",
        body.operator,
        body.value,
        "characters",
      );

      const rows = await Modifiers.update(
        tx,
        {
          target: body.target,
          value: body.value,
          valueType,
          operator: body.operator,
        },
        { id: modifierId, expectedUpdatedAt: body.updatedAt },
      );
      if (body.updatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const modifier = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifierId,
        targetTable: getTableName(modifiersInCustomization),
        type: "updateCharacterModifier",
        data: { characterName: character.name, target: body.target, value: body.value, operator: body.operator },
      });

      return modifier;
    });
  }
}

export default new CharacterModifiersService();
