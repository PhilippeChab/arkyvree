import { Engine } from "@/engine/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, Modifiers } from "@/server/repositories/index.ts";
import { getEditableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterModifiersService {
  /** The row a character's modifier stores, as the engine plans it: its operator and value checked against its path. */
  private async planModifier(rulesetId: string, body: { operator: string; target: string; value: string }) {
    const { operator, target, value } = body;
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope)
        .targetPaths()
        .planModifier(await RulesetViews.getTargetPathCatalogs(scope, "modifier"), "characters", {
          operator,
          target,
          value,
        }),
    );
  }

  async createModifier(
    session: Session,
    characterId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return withTransaction(async (tx) => {
      const character = await getEditableCharacter(tx, session, characterId);

      const row = await this.planModifier(character.rulesetId, body);

      const rows = await Modifiers.create(tx, { sourceId: characterId, sourceType: "characters", ...row });
      const modifier = rows[0];

      const { operator, target, value } = row;
      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifier.id,
        targetType: TARGET_TYPES.modifiers,
        type: "createCharacterModifier",
        data: { characterName: character.name, target, value, operator },
      });

      return modifier;
    });
  }

  async deleteModifier(session: Session, characterId: string, modifierId: string) {
    return withTransaction(async (tx) => {
      const character = await getEditableCharacter(tx, session, characterId);

      const existing = await Modifiers.findOne(tx, {
        id: modifierId,
        sourceId: characterId,
        sourceType: "characters",
      });
      if (!existing) throw new NotFoundError("Modifier not found");

      const rows = await Modifiers.delete(tx, { ids: [modifierId] });
      const modifier = rows[0];

      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifierId,
        targetType: TARGET_TYPES.modifiers,
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
    return await withRulesetScope(db, character.rulesetId, async (scope) =>
      Engine.for(scope)
        .targetPaths()
        .describeModifiers(await RulesetViews.getTargetPaths(scope, "modifier"), modifiers),
    );
  }

  async updateModifier(
    session: Session,
    characterId: string,
    modifierId: string,
    body: { operator: string; target: string; updatedAt?: string; value: string },
  ) {
    return withTransaction(async (tx) => {
      const character = await getEditableCharacter(tx, session, characterId);

      const existing = await Modifiers.findOne(tx, {
        id: modifierId,
        sourceId: characterId,
        sourceType: "characters",
      });
      if (!existing) throw new NotFoundError("Modifier not found");

      const row = await this.planModifier(character.rulesetId, body);

      const rows = await Modifiers.update(tx, row, { id: modifierId, expectedUpdatedAt: body.updatedAt });
      if (body.updatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

      const modifier = rows[0];

      const { operator, target, value } = row;
      await Activities.create(tx, {
        userId: session.userId,
        targetId: modifierId,
        targetType: TARGET_TYPES.modifiers,
        type: "updateCharacterModifier",
        data: { characterName: character.name, target, value, operator },
      });

      return modifier;
    });
  }
}

export default new CharacterModifiersService();
