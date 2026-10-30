import { Engine } from "@/engine/index.ts";
import { CustomizationCopies, CustomizationEdit, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import type { Session } from "@/shared/relations.ts";

class ModifiersService {
  /**
   * Adds a modifier to an entity, copying the entity first when it's inherited. A duplicate (`sourceModifierId`, one of
   * the entity's modifiers) takes its source's requirements too.
   */
  private async addEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: { operator: string; target: string; value: string },
    sourceModifierId?: string,
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => {
          const { rulesetData, sources } = scope;
          policy.canUpdateEntity();

          const catalogs = await RulesetViews.getTargetPathCatalogs(scope, "modifier");
          const modifiers = Engine.for(scope).modifiers(entityType, entityId);
          const { entity, row } = modifiers.planCreate(catalogs, body, sourceModifierId);

          const edit = new CustomizationEdit(sources, rulesetData.cow);
          const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);

          const rows = await Modifiers.create(tx, { sourceId: resolvedEntityId, sourceType: entityType, ...row });
          const modifier = rows[0];

          if (sourceModifierId) {
            const cust = (await CustomizationCopies.read(tx, [sourceModifierId], "modifiers")).get(sourceModifierId);
            if (cust) await CustomizationCopies.copy(tx, modifier.id, "modifiers", cust);
          }

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: modifier.id,
            targetType: TARGET_TYPES.modifiers,
            type: "createModifier",
            data: { entityName: entity.name, target: row.target, value: row.value, operator: row.operator },
          });

          return { ...modifier, resolvedEntityId };
        }),
    );
    // Modifiers decide target paths too: the slots and joins of a list decide its spell levels and known paths
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async createModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return await this.addEntityModifier(session, rulesetId, entityType, entityId, body);
  }

  async deleteModifier(session: Session, rulesetId: string, entityType: string, entityId: string, modifierId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => {
          const { rulesetData, sources } = scope;
          policy.canDeleteEntity();

          const { entity, modifier } = Engine.for(scope).modifiers(entityType, entityId).planDelete(modifierId);

          const edit = new CustomizationEdit(sources, rulesetData.cow);
          const { customization, resolvedEntityId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "modifier",
            modifierId,
          );

          // The database deletes the modifier's requirements with it
          const rows = await Modifiers.delete(tx, { ids: [customization.id] });
          const deletedModifier = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: deletedModifier.id,
            targetType: TARGET_TYPES.modifiers,
            type: "deleteModifier",
            data: {
              rulesetId,
              entityName: entity.name,
              target: modifier.target,
              value: modifier.value,
              operator: modifier.operator,
            },
          });

          return { ...deletedModifier, resolvedEntityId };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async duplicateModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    sourceModifierId: string,
    body: { operator: string; target: string; value: string },
  ) {
    return await this.addEntityModifier(session, rulesetId, entityType, entityId, body, sourceModifierId);
  }

  async getModifier(session: Session, rulesetId: string, entityType: string, entityId: string, modifierId: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope, "modifier");
      return Engine.for(scope).modifiers(entityType, entityId).describe(catalog, modifierId);
    });
  }

  async getModifiers(session: Session, rulesetId: string, entityType: string, entityId: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope, "modifier");
      return Engine.for(scope).modifiers(entityType, entityId).describeAll(catalog);
    });
  }

  async updateModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    modifierId: string,
    body: {
      operator: string;
      target: string;
      updatedAt?: string;
      value: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => {
          const { rulesetData, sources } = scope;
          policy.canUpdateEntity();

          const catalogs = await RulesetViews.getTargetPathCatalogs(scope, "modifier");
          const { updatedAt, ...fields } = body;
          const modifiers = Engine.for(scope).modifiers(entityType, entityId);
          const { entity, row } = modifiers.planEdit(catalogs, modifierId, fields);

          // COW the owning entity if this modifier is inherited
          const edit = new CustomizationEdit(sources, rulesetData.cow);
          const { customization, resolvedEntityId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "modifier",
            modifierId,
          );

          const expectedUpdatedAt = customization.expected(updatedAt);
          const rows = await Modifiers.update(tx, row, { id: customization.id, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedModifier = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: updatedModifier.id,
            targetType: TARGET_TYPES.modifiers,
            type: "updateModifier",
            data: { entityName: entity.name, target: row.target, value: row.value, operator: row.operator },
          });

          return { ...updatedModifier, resolvedEntityId };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new ModifiersService();
