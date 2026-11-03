import { Engine } from "@/engine/index.ts";
import { RulesetViews, type SharedRulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, Modifiers } from "@/server/repositories/index.ts";
import { getRowReadableCharacter } from "@/server/services/characters/editableCharacter.ts";
import { withCharacterWrite, withLockedCharacter } from "@/server/services/writes/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class CharacterModifiersService {
  /**
   * The row a character's modifier stores, as the engine plans it: its operator and value checked against its path, of
   * the character's ruleset's view as its write holds it (`scope`).
   */
  private async planModifier(scope: SharedRulesetScope, body: { operator: string; target: string; value: string }) {
    const { operator, target, value } = body;
    return Engine.for(scope)
      .targetPaths()
      .planModifier(await RulesetViews.getTargetPathCatalogs(scope, "modifier"), "characters", {
        operator,
        target,
        value,
      });
  }

  async createModifier(
    session: Session,
    characterId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return await withCharacterWrite(session, characterId, async (tx, scope, character) => {
      const row = await this.planModifier(scope, body);

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
    // Archived or not: an archived one is its policy's to refuse
    return await withLockedCharacter(session, characterId, async (tx, policy, character) => {
      policy.canEditRows();

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

  /** One of a character's own modifiers, labeled as its list labels it (`getModifiers`): refused when it's none of theirs. */
  async getModifier(session: Session, characterId: string, modifierId: string) {
    const character = await getRowReadableCharacter(db, session, characterId);

    return await withRulesetScope(db, character.rulesetId, async (scope) => {
      const modifier = await Modifiers.findOne(db, { id: modifierId, sourceId: characterId, sourceType: "characters" });
      const paths = await RulesetViews.getTargetPaths(scope, "modifier");
      const [described] = modifier ? Engine.for(scope).targetPaths().describeModifiers(paths, [modifier]) : [];
      if (!described) throw new NotFoundError("Modifier not found");
      return described;
    });
  }

  async getModifiers(session: Session, characterId: string) {
    // Its editors read them, an archived one's too, as its inventory: a read refuses no state
    const character = await getRowReadableCharacter(db, session, characterId);

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
    return await withCharacterWrite(session, characterId, async (tx, scope, character) => {
      const existing = await Modifiers.findOne(tx, {
        id: modifierId,
        sourceId: characterId,
        sourceType: "characters",
      });
      if (!existing) throw new NotFoundError("Modifier not found");

      const row = await this.planModifier(scope, body);

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
