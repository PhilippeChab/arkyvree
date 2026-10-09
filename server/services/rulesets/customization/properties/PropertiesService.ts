import { getTableName } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { RulesetEdit, RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { type Db, db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { checkCustomizedEntity } from "@/server/services/rulesets/customization/customizableEntities.ts";
import type { Session } from "@/shared/relations.ts";

/** A property's body, as its form sends it. */
interface PropertyBody {
  description?: string;
  type: string;
  value: string;
}

class PropertiesService {
  /** Writes a new property on the entity (`resolvedEntityId`, its copy when it was inherited), and records it. */
  private async writeProperty(
    tx: Db,
    session: Session,
    entity: { name: string; type: string },
    resolvedEntityId: string,
    body: PropertyBody,
  ) {
    const rows = await Properties.create(tx, {
      entityId: resolvedEntityId,
      entityType: entity.type,
      value: body.value,
      type: body.type,
      description: body.description,
    });
    const property = rows[0];

    await createActivityWithNotifications(tx, {
      userId: session.userId,
      targetId: property.id,
      targetTable: getTableName(propertiesInCustomization),
      type: "createProperty",
      data: { entityName: entity.name, entityType: entity.type, propertyType: body.type, value: body.value },
    });

    return { ...property, resolvedEntityId };
  }

  async createProperty(session: Session, rulesetId: string, entityType: string, entityId: string, body: PropertyBody) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { entity } = Engine.for(scope).properties(entityType, entityId).planCreate();

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);
          return await this.writeProperty(tx, session, { name: entity.name, type: entityType }, resolvedEntityId, body);
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async deleteProperty(session: Session, rulesetId: string, entityType: string, entityId: string, propertyId: string) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

          const { entity, property } = Engine.for(scope).properties(entityType, entityId).planDelete(propertyId);
          await checkCustomizedEntity(property);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedPropertyId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "property",
            propertyId,
          );

          const rows = await Properties.delete(tx, { id: resolvedPropertyId });
          const deletedProperty = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: deletedProperty.id,
            targetTable: getTableName(propertiesInCustomization),
            type: "deleteProperty",
            data: {
              rulesetId,
              entityName: entity.name,
              entityType,
              propertyType: property.type,
              value: property.value,
            },
          });

          return { ...deletedProperty, resolvedEntityId };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }

  async getProperties(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) =>
      Engine.for(scope).properties(entityType, entityId).describeAll(),
    );
  }

  async updateProperty(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    propertyId: string,
    body: PropertyBody & { updatedAt?: string },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const { entity, override, property } = Engine.for(scope)
            .properties(entityType, entityId)
            .planEdit(propertyId);
          await checkCustomizedEntity(property);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { updatedAt, ...propertyData } = body;
          if (override) {
            // Its template's property: the edit overrides it with one of the item's own
            const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);
            return await this.writeProperty(
              tx,
              session,
              { name: entity.name, type: entityType },
              resolvedEntityId,
              propertyData,
            );
          }

          // COW the owning entity if this property is inherited
          const { resolvedEntityId, resolvedCustomizationId: resolvedPropertyId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "property",
            propertyId,
          );

          const expectedUpdatedAt = resolvedPropertyId === propertyId ? updatedAt : undefined;
          const rows = await Properties.update(tx, propertyData, { id: resolvedPropertyId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedProperty = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: updatedProperty.id,
            targetTable: getTableName(propertiesInCustomization),
            type: "updateProperty",
            data: { entityName: entity.name, entityType, propertyType: body.type, value: body.value },
          });

          return { ...updatedProperty, resolvedEntityId };
        }),
    );
    RulesetViews.invalidate(rulesetId);
    return result;
  }
}

export default new PropertiesService();
