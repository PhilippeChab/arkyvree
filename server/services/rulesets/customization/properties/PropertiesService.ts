import { getTableName } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { type CachedRulesetData, RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { cowCustomizationForMutation, cowEntityForCustomization } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  checkCustomizedEntity,
  getCustomizableEntityName,
} from "@/server/services/rulesets/customization/customizableEntities.ts";
import type { Property, Session } from "@/shared/relations.ts";

class PropertiesService {
  /**
   * A property shown on the entity, looked up like requirements and modifiers:
   * its own and visible sibling contributions. A derived item also shows its
   * template's properties; editing one creates an override on the item.
   */
  private findEntityProperty(rulesetData: CachedRulesetData, entityType: string, entityId: string, propertyId: string) {
    const matches = (p: Property) => p.id === propertyId && p.entityType === entityType;
    const own = rulesetData.propertiesByEntity.get(entityId)?.find(matches);
    if (own) return { property: own, fromTemplate: false };
    const sourceItemId = entityType === "items" ? rulesetData.itemsById.get(entityId)?.sourceItemId : undefined;
    const inherited = sourceItemId ? rulesetData.propertiesByEntity.get(sourceItemId)?.find(matches) : undefined;
    if (inherited) return { property: inherited, fromTemplate: true };
    throw new NotFoundError("Property not found for this entity");
  }

  async createProperty(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: {
      value: string;
      type: string;
      description?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

        const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        const rows = await Properties.create(tx, {
          entityId: resolvedEntityId,
          entityType,
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
          data: { entityName, entityType, propertyType: body.type, value: body.value },
        });

        return { ...property, resolvedEntityId };
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async deleteProperty(session: Session, rulesetId: string, entityType: string, entityId: string, propertyId: string) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

        const { property, fromTemplate } = this.findEntityProperty(
          rulesetData,
          entityType,
          effectiveEntityId,
          propertyId,
        );
        if (fromTemplate) {
          // Template property: nothing to delete on the derived item since it doesn't own it.
          throw new BadRequestError("Cannot delete a property inherited from a template");
        }

        await checkCustomizedEntity(property);

        const { resolvedEntityId, resolvedCustomizationId: resolvedPropertyId } = await cowCustomizationForMutation(
          tx,
          rulesetId,
          entityType,
          effectiveEntityId,
          "property",
          propertyId,
        );

        const rows = await Properties.delete(tx, { id: resolvedPropertyId });
        const deletedProperty = rows[0];

        const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: deletedProperty.id,
          targetTable: getTableName(propertiesInCustomization),
          type: "deleteProperty",
          data: { rulesetId, entityName, entityType, propertyType: property.type, value: property.value },
        });

        return { ...deletedProperty, resolvedEntityId };
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }

  async getProperties(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const effectiveEntityId = rulesetData.canonicalize(entityId);
      await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
      const all = rulesetData.propertiesByEntity.get(effectiveEntityId) ?? [];
      return all.filter((p) => p.entityType === entityType);
    });
  }

  async updateProperty(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    propertyId: string,
    body: {
      value: string;
      type: string;
      description?: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

        const { property, fromTemplate } = this.findEntityProperty(
          rulesetData,
          entityType,
          effectiveEntityId,
          propertyId,
        );

        await checkCustomizedEntity(property);

        if (fromTemplate) {
          // Template property: create an override on the derived item
          const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);
          const rows = await Properties.create(tx, {
            entityId: resolvedEntityId,
            entityType,
            value: body.value,
            type: body.type,
            description: body.description,
          });
          const newProperty = rows[0];

          const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: newProperty.id,
            targetTable: getTableName(propertiesInCustomization),
            type: "createProperty",
            data: { entityName, entityType, propertyType: body.type, value: body.value },
          });

          return { ...newProperty, resolvedEntityId };
        }

        // COW the owning entity if this property is inherited
        const { resolvedEntityId, resolvedCustomizationId: resolvedPropertyId } = await cowCustomizationForMutation(
          tx,
          rulesetId,
          entityType,
          effectiveEntityId,
          "property",
          propertyId,
        );

        const expectedUpdatedAt = resolvedPropertyId === propertyId ? body.updatedAt : undefined;
        const { updatedAt: _u, ...propertyData } = body;
        const rows = await Properties.update(tx, propertyData, { id: resolvedPropertyId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedProperty = rows[0];

        const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: updatedProperty.id,
          targetTable: getTableName(propertiesInCustomization),
          type: "updateProperty",
          data: { entityName, entityType, propertyType: body.type, value: body.value },
        });

        return { ...updatedProperty, resolvedEntityId };
      });
    });
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new PropertiesService();
