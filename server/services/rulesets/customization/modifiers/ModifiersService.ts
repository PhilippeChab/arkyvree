import { getTableName } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import {
  readTargetPathCatalogs,
  readTargetPaths,
  RulesetCache,
  withRulesetScope,
} from "@/server/cache/rulesetCache/index.ts";
import { copyEntityCustomizations, fetchEntityCustomizations, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { checkCustomizedEntity } from "@/server/services/rulesets/customization/customizableEntities.ts";
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
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const catalogs = await readTargetPathCatalogs(rulesetId, "modifier");
          const modifiers = Engine.for(scope).modifiers(entityType, entityId);
          const { entity, valueType } = modifiers.planCreate(catalogs, body, sourceModifierId);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);

          const rows = await Modifiers.create(tx, {
            sourceId: resolvedEntityId,
            sourceType: entityType,
            target: body.target,
            value: body.value,
            valueType,
            operator: body.operator,
          });
          const modifier = rows[0];

          if (sourceModifierId) {
            const cust = (await fetchEntityCustomizations(tx, [sourceModifierId], "modifiers")).get(sourceModifierId);
            if (cust) await copyEntityCustomizations(tx, modifier.id, "modifiers", cust);
          }

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: modifier.id,
            targetTable: getTableName(modifiersInCustomization),
            type: "createModifier",
            data: {
              entityName: entity.name,
              entityType,
              target: body.target,
              value: body.value,
              operator: body.operator,
            },
          });

          return { ...modifier, resolvedEntityId };
        }),
    );
    // Modifiers decide target paths too: the slots and joins of a list decide its spell levels and known paths
    RulesetCache.invalidate(rulesetId);
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
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

          const { entity, modifier } = Engine.for(scope).modifiers(entityType, entityId).planDelete(modifierId);
          await checkCustomizedEntity(modifier);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedModifierId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "modifier",
            modifierId,
          );

          // The database deletes the modifier's requirements with it
          const rows = await Modifiers.delete(tx, { ids: [resolvedModifierId] });
          const deletedModifier = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: deletedModifier.id,
            targetTable: getTableName(modifiersInCustomization),
            type: "deleteModifier",
            data: {
              rulesetId,
              entityName: entity.name,
              entityType,
              target: modifier.target,
              value: modifier.value,
              operator: modifier.operator,
            },
          });

          return { ...deletedModifier, resolvedEntityId };
        }),
    );
    RulesetCache.invalidate(rulesetId);
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

  async getModifier(rulesetId: string, entityType: string, entityId: string, modifierId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const catalog = await readTargetPaths(rulesetId, "modifier");
      return Engine.for(scope).modifiers(entityType, entityId).describe(catalog, modifierId);
    });
  }

  async getModifiers(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const catalog = await readTargetPaths(rulesetId, "modifier");
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
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const catalogs = await readTargetPathCatalogs(rulesetId, "modifier");
          const { updatedAt, ...fields } = body;
          const modifiers = Engine.for(scope).modifiers(entityType, entityId);
          const { entity, modifier, valueType } = modifiers.planEdit(catalogs, modifierId, fields);
          await checkCustomizedEntity(modifier);

          // COW the owning entity if this modifier is inherited
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedModifierId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "modifier",
            modifierId,
          );

          const expectedUpdatedAt = resolvedModifierId === modifierId ? updatedAt : undefined;
          const rows = await Modifiers.update(
            tx,
            { target: body.target, value: body.value, valueType, operator: body.operator },
            { id: resolvedModifierId, expectedUpdatedAt },
          );
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedModifier = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: updatedModifier.id,
            targetTable: getTableName(modifiersInCustomization),
            type: "updateModifier",
            data: {
              entityName: entity.name,
              entityType,
              target: body.target,
              value: body.value,
              operator: body.operator,
            },
          });

          return { ...updatedModifier, resolvedEntityId };
        }),
    );
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ModifiersService();
