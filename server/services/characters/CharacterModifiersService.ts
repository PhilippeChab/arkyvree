import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { Activities, Characters, Modifiers } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { deleteModifiersWithCascade } from "@/server/services/rulesets/cow.ts";
import TargetPathsService from "@/server/services/rulesets/customization/TargetPathsService.ts";
import { pickTargetLabels } from "@/shared/customization/target.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";

export const CharacterModifiersMethods = {
  async getModifiers(session: Session, characterId: string) {
    const character = await Characters.findOneEditable(db, { id: characterId, userId: session.userId });
    if (!character) throw new NotFoundError("Character not found");

    const [modifiers, pathsResult] = await Promise.all([
      Modifiers.findManyBySource(db, {
        sourceIds: [characterId],
        sourceType: "characters",
      }),
      TargetPathsService.initialize().call("getTargetPathsWithLabels", character.rulesetId, "modifier"),
    ]);
    const { segmentLabels } = pathsResult[0] ? pathsResult[1] : { segmentLabels: {} };

    return modifiers.map((m) => ({ ...m, targetLabels: pickTargetLabels([m.target, m.value], segmentLabels) }));
  },

  async createModifier(
    session: Session,
    characterId: string,
    body: { target: string; value: string; operator: string },
  ) {
    return withTransaction(async (tx) => {
      const character = await Characters.findOneEditable(tx, { id: characterId, userId: session.userId });
      if (!character) throw new NotFoundError("Character not found");

      const pathsService = TargetPathsService.initialize();
      const valueTypeResult = await pathsService.call("resolvePathValueType", character.rulesetId, body.target, "modifier");
      if (!valueTypeResult[0]) throw valueTypeResult[2];
      const valueType = valueTypeResult[1];

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
  },

  async updateModifier(
    session: Session,
    characterId: string,
    modifierId: string,
    body: { target: string; value: string; operator: string; updatedAt?: string },
  ) {
    return withTransaction(async (tx) => {
      const character = await Characters.findOneEditable(tx, { id: characterId, userId: session.userId });
      if (!character) throw new NotFoundError("Character not found");

      const existing = await Modifiers.findOne(tx, { id: modifierId });
      if (!existing || existing.sourceId !== characterId || existing.sourceType !== "characters") {
        throw new NotFoundError("Modifier not found");
      }

      const pathsService = TargetPathsService.initialize();
      const valueTypeResult = await pathsService.call("resolvePathValueType", character.rulesetId, body.target, "modifier");
      if (!valueTypeResult[0]) throw valueTypeResult[2];
      const valueType = valueTypeResult[1];

      const rows = await Modifiers.update(tx, {
        target: body.target,
        value: body.value,
        valueType,
        operator: body.operator,
      }, { id: modifierId, expectedUpdatedAt: body.updatedAt });
      if (body.updatedAt && rows.length === 0) {
        throw new ConflictError(STALE_ENTITY_MESSAGE);
      }
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
  },

  async deleteModifier(session: Session, characterId: string, modifierId: string) {
    return withTransaction(async (tx) => {
      const character = await Characters.findOneEditable(tx, { id: characterId, userId: session.userId });
      if (!character) throw new NotFoundError("Character not found");

      const existing = await Modifiers.findOne(tx, { id: modifierId });
      if (!existing || existing.sourceId !== characterId || existing.sourceType !== "characters") {
        throw new NotFoundError("Modifier not found");
      }

      const rows = await deleteModifiersWithCascade(tx, { ids: [modifierId] });
      const modifier = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifierId,
        targetTable: getTableName(modifiersInCustomization),
        type: "deleteCharacterModifier",
        data: { characterName: character.name, target: existing.target, value: existing.value, operator: existing.operator },
      });

      return modifier;
    });
  },
};

export default class CharacterModifiersService extends BaseService<typeof CharacterModifiersMethods> {
  static initialize() {
    return new CharacterModifiersService(CharacterModifiersMethods);
  }
}
