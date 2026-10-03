import { getTableName } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { invalidateRulesetEntities } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import BaseService from "@/server/services/BaseService.ts";
import { CustomizationsPolicy } from "@/server/services/policies/index.ts";
import {
  copyEntityCustomizations,
  cowCustomizationForMutation,
  cowEntityForCustomization,
  fetchEntityCustomizations,
  withRulesetScope,
} from "@/server/services/rulesets/cow.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import { pickTargetLabels } from "@/shared/customization/target.ts";
import type { Session } from "@/shared/relations.ts";

import { getTargetPathsWithLabels, resolvePathValueType } from "./targetPaths.ts";

/**
 * Adds a modifier to an entity, copying the entity first when it's inherited. A duplicate (`sourceModifierId`, one of
 * the entity's modifiers) takes its source's requirements too.
 */
async function addEntityModifier(
  session: Session,
  rulesetId: string,
  entityType: string,
  entityId: string,
  body: { target: string; value: string; operator: string },
  sourceModifierId?: string,
) {
  const result = await withTransaction(async (tx) => {
    return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
      (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

      const effectiveEntityId = rulesetData.canonicalize(entityId);
      const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

      if (sourceModifierId) {
        const sourceModifier = rulesetData.modifiersById.get(sourceModifierId);
        if (
          !sourceModifier ||
          sourceModifier.sourceId !== effectiveEntityId ||
          sourceModifier.sourceType !== entityType
        ) {
          throw new NotFoundError("Source modifier not found for this entity");
        }
      }

      const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

      const inferredValueType = await resolvePathValueType(rulesetId, body.target, "modifier");

      const rows = await Modifiers.create(tx, {
        sourceId: resolvedEntityId,
        sourceType: entityType,
        target: body.target,
        value: body.value,
        valueType: inferredValueType,
        operator: body.operator,
      });
      const modifier = rows[0];

      if (sourceModifierId) {
        const cust = (await fetchEntityCustomizations(tx, [sourceModifierId], "modifiers")).get(sourceModifierId);
        if (cust) await copyEntityCustomizations(tx, sourceModifierId, modifier.id, "modifiers", cust);
      }

      await createActivityWithNotifications(tx, {
        userId: session.userId,
        targetId: modifier.id,
        targetTable: getTableName(modifiersInCustomization),
        type: "createModifier",
        data: { entityName, entityType, target: body.target, value: body.value, operator: body.operator },
      });

      return { ...modifier, resolvedEntityId };
    });
  });
  invalidateRulesetEntities(rulesetId);
  return result;
}

const ModifiersMethods = {
  async getEntityModifiers(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const resolvedId = rulesetData.canonicalize(entityId);
      await CustomizationsPolicy.sourceExists(resolvedId, entityType, rulesetData);
      // Compose step pre-merges sibling modifiers into the winner's bucket with
      // sourceId remapped. Filter by sourceType to isolate the requested family.
      const allMods = rulesetData.modifiersBySource.get(resolvedId) ?? [];
      const modifiers = allMods.filter((m) => m.sourceType === entityType);

      const { paths, segmentLabels } = await getTargetPathsWithLabels(rulesetId, "modifier");
      const pathMap = new Map(paths.map((p) => [p.path, p]));

      return modifiers.map((m) => {
        const pathDef = pathMap.get(m.target);
        const valueLabel = pathDef?.possibleValues?.find((pv) => pv.value === m.value)?.label ?? null;
        return { ...m, valueLabel, targetLabels: pickTargetLabels([m.target, m.value], segmentLabels) };
      });
    });
  },

  async getEntityModifier(rulesetId: string, entityType: string, entityId: string, modifierId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const effectiveEntityId = rulesetData.canonicalize(entityId);

      const parentName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
      const modifier = rulesetData.modifiersById.get(modifierId);
      if (!modifier) throw new NotFoundError("Modifier not found");

      const sourceName =
        modifier.sourceId === effectiveEntityId && modifier.sourceType === entityType
          ? parentName
          : await CustomizationsPolicy.sourceExists(modifier.sourceId, modifier.sourceType, rulesetData);

      const requirements = rulesetData.requirementsByEntity.get(modifierId) ?? [];
      const modifierRequirements = requirements.filter((r) => r.entityType === "modifiers");
      const { segmentLabels } = await getTargetPathsWithLabels(rulesetId, "modifier");

      return {
        ...modifier,
        sourceName,
        requirements: modifierRequirements,
        targetLabels: pickTargetLabels([modifier.target, modifier.value], segmentLabels),
      };
    });
  },

  async createEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: { target: string; value: string; operator: string },
  ) {
    return await addEntityModifier(session, rulesetId, entityType, entityId, body);
  },

  async duplicateEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    sourceModifierId: string,
    body: { target: string; value: string; operator: string },
  ) {
    return await addEntityModifier(session, rulesetId, entityType, entityId, body, sourceModifierId);
  },

  async updateEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    modifierId: string,
    body: {
      target: string;
      value: string;
      operator: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

        const modifier = rulesetData.modifiersById.get(modifierId);
        if (!modifier || modifier.sourceId !== effectiveEntityId || modifier.sourceType !== entityType) {
          throw new NotFoundError("Modifier not found for this entity");
        }

        const customizationPolicy = new CustomizationsPolicy(session, modifier);
        await customizationPolicy.canUpdate();

        // COW the owning entity if this modifier is inherited
        const { resolvedEntityId, resolvedCustomizationId: resolvedModifierId } = await cowCustomizationForMutation(
          tx,
          rulesetId,
          entityType,
          effectiveEntityId,
          "modifier",
          modifierId,
        );

        const inferredValueType = await resolvePathValueType(rulesetId, body.target, "modifier");

        const expectedUpdatedAt = resolvedModifierId === modifierId ? body.updatedAt : undefined;
        const rows = await Modifiers.update(
          tx,
          {
            target: body.target,
            value: body.value,
            valueType: inferredValueType,
            operator: body.operator,
          },
          { id: resolvedModifierId, expectedUpdatedAt },
        );
        if (expectedUpdatedAt && rows.length === 0) {
          throw new ConflictError(STALE_ENTITY_MESSAGE);
        }
        const updatedModifier = rows[0];

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: updatedModifier.id,
          targetTable: getTableName(modifiersInCustomization),
          type: "updateModifier",
          data: { entityName, entityType, target: body.target, value: body.value, operator: body.operator },
        });

        return { ...updatedModifier, resolvedEntityId };
      });
    });
    invalidateRulesetEntities(rulesetId);
    return result;
  },

  async deleteEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    modifierId: string,
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

        const modifier = rulesetData.modifiersById.get(modifierId);
        if (!modifier || modifier.sourceId !== effectiveEntityId || modifier.sourceType !== entityType) {
          throw new NotFoundError("Modifier not found for this entity");
        }

        const customizationPolicy = new CustomizationsPolicy(session, modifier);
        await customizationPolicy.canDelete();

        const { resolvedEntityId, resolvedCustomizationId: resolvedModifierId } = await cowCustomizationForMutation(
          tx,
          rulesetId,
          entityType,
          effectiveEntityId,
          "modifier",
          modifierId,
        );

        // The database deletes the modifier's requirements with it
        const rows = await Modifiers.deleteMany(tx, { ids: [resolvedModifierId] });
        const deletedModifier = rows[0];

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: deletedModifier.id,
          targetTable: getTableName(modifiersInCustomization),
          type: "deleteModifier",
          data: {
            rulesetId,
            entityName,
            entityType,
            target: modifier.target,
            value: modifier.value,
            operator: modifier.operator,
          },
        });

        return { ...deletedModifier, resolvedEntityId };
      });
    });
    invalidateRulesetEntities(rulesetId);
    return result;
  },
} as const;

class ModifiersService extends BaseService<typeof ModifiersMethods> {
  static initialize() {
    return new ModifiersService(ModifiersMethods);
  }
}

export default ModifiersService;
