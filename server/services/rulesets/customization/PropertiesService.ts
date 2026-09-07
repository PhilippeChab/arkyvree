import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, Items, Properties } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import { CustomizationsPolicy } from "@/server/services/policies/index.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import { cowEntityForCustomization, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import type { Session } from "@/shared/relations.ts";
import type { Db } from "@/server/database/index.ts";
import { getTableName } from "drizzle-orm";

async function isTemplateProperty(db: Db, entityType: string, entityId: string, property: { entityId: string }) {
  if (entityType !== "items" || property.entityId === entityId) return false;
  const item = await Items.findOne(db, { id: entityId });
  return !!item?.sourceItemId && property.entityId === item.sourceItemId;
}

export const PropertiesMethods = {
  async getEntityProperties(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const effectiveEntityId = rulesetData.canonicalize(entityId);
      await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
      const all = rulesetData.propertiesByEntity.get(effectiveEntityId) ?? [];
      return all.filter((p) => p.entityType === entityType);
    });
  },

  async createEntityProperty(
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

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

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
    invalidateRuleset(rulesetId);
    return result;
  },

  async updateEntityProperty(
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

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);

        const property = await Properties.findOne(tx, { id: propertyId });
        if (!property || property.entityType !== entityType) {
          throw new NotFoundError("Property not found for this entity");
        }

        const fromTemplate = await isTemplateProperty(tx, entityType, effectiveEntityId, property);
        if (!fromTemplate && property.entityId !== effectiveEntityId) {
          throw new NotFoundError("Property not found for this entity");
        }

        const customizationPolicy = new CustomizationsPolicy(session, property);
        await customizationPolicy.canUpdate();

        const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        if (fromTemplate) {
          // Template property: create an override on the derived item
          const rows = await Properties.create(tx, {
            entityId: resolvedEntityId,
            entityType,
            value: body.value,
            type: body.type,
            description: body.description,
          });
          const newProperty = rows[0];

          const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: newProperty.id,
            targetTable: getTableName(propertiesInCustomization),
            type: "createProperty",
            data: { entityName, entityType, propertyType: body.type, value: body.value },
          });

          return { ...newProperty, resolvedEntityId };
        }

        let resolvedPropertyId = propertyId;
        if (resolvedEntityId !== effectiveEntityId) {
          const newProperties = await Properties.findManyByEntity(tx, { entityIds: [resolvedEntityId], entityType });
          const match = newProperties.find(p =>
            p.type === property.type &&
            p.value === property.value &&
            (p.description ?? null) === (property.description ?? null),
          );
          if (match) resolvedPropertyId = match.id;
        }

        const expectedUpdatedAt = resolvedPropertyId === propertyId ? body.updatedAt : undefined;
        const { updatedAt: _u, ...propertyData } = body;
        const rows = await Properties.update(tx, propertyData, { id: resolvedPropertyId, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedProperty = rows[0];

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
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
    invalidateRuleset(rulesetId);
    return result;
  },

  async deleteEntityProperty(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    propertyId: string,
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {

        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);

        const property = await Properties.findOne(tx, { id: propertyId });
        if (!property || property.entityType !== entityType) {
          throw new NotFoundError("Property not found for this entity");
        }

        const fromTemplate = await isTemplateProperty(tx, entityType, effectiveEntityId, property);
        if (!fromTemplate && property.entityId !== effectiveEntityId) {
          throw new NotFoundError("Property not found for this entity");
        }

        const customizationPolicy = new CustomizationsPolicy(session, property);
        await customizationPolicy.canDelete();

        const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);
        let resolvedPropertyId = propertyId;
        if (fromTemplate) {
          // Template property: nothing to delete on the derived item since it doesn't own it.
          throw new BadRequestError("Cannot delete a property inherited from a template");
        }
        if (resolvedEntityId !== effectiveEntityId) {
          const newProperties = await Properties.findManyByEntity(tx, { entityIds: [resolvedEntityId], entityType });
          const match = newProperties.find(p =>
            p.type === property.type &&
            p.value === property.value &&
            (p.description ?? null) === (property.description ?? null),
          );
          if (match) resolvedPropertyId = match.id;
        }

        const rows = await Properties.delete(tx, { id: resolvedPropertyId });
        const deletedProperty = rows[0];

        await Activities.deleteByTarget(tx, { targetId: deletedProperty.id, targetTable: getTableName(propertiesInCustomization) });

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
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
    invalidateRuleset(rulesetId);
    return result;
  },
} as const;

class PropertiesService extends BaseService<typeof PropertiesMethods> {
  static initialize() {
    return new PropertiesService(PropertiesMethods);
  }
}

export default PropertiesService;
