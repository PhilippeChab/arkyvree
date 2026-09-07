import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { invalidateRulesetEntities } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import { CustomizationsPolicy } from "@/server/services/policies/index.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import { copyEntityCustomizations, cowEntityForCustomization, deleteModifiersWithCascade, fetchEntityCustomizations, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { pickTargetLabels } from "@/shared/customization/target.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";
import TargetPathsService from "./TargetPathsService.ts";

export const ModifiersMethods = {
  async getEntityModifiers(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const resolvedId = rulesetData.canonicalize(entityId);
      await CustomizationsPolicy.sourceExists(resolvedId, entityType, rulesetData);
      // Compose step pre-merges sibling modifiers into the winner's bucket with
      // sourceId remapped. Filter by sourceType to isolate the requested family.
      const allMods = rulesetData.modifiersBySource.get(resolvedId) ?? [];
      const modifiers = allMods.filter((m) => m.sourceType === entityType);

      const pathsResult = await TargetPathsService.initialize().call("getTargetPathsWithLabels", rulesetId, "modifier");
      const { paths, segmentLabels } = pathsResult[0] ? pathsResult[1] : { paths: [], segmentLabels: {} };
      const pathMap = new Map(paths.map((p) => [p.path, p]));

      return modifiers.map((m) => {
        const pathDef = pathMap.get(m.target);
        const valueLabel = pathDef?.possibleValues?.find((pv) => pv.value === m.value)?.label ?? null;
        return { ...m, valueLabel, targetLabels: pickTargetLabels([m.target, m.value], segmentLabels) };
      });
    });
  },

  async getEntityModifier(
    rulesetId: string,
    entityType: string,
    entityId: string,
    modifierId: string,
  ) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const effectiveEntityId = rulesetData.canonicalize(entityId);

      const parentName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
      const modifier = rulesetData.modifiersById.get(modifierId);
      if (!modifier) throw new NotFoundError("Modifier not found");

      const sourceName = modifier.sourceId === effectiveEntityId && modifier.sourceType === entityType
        ? parentName
        : await CustomizationsPolicy.sourceExists(modifier.sourceId, modifier.sourceType, rulesetData);

      const requirements = rulesetData.requirementsByEntity.get(modifierId) ?? [];
      const modifierRequirements = requirements.filter((r) => r.entityType === "modifiers");
      const pathsResult = await TargetPathsService.initialize().call("getTargetPathsWithLabels", rulesetId, "modifier");
      const { segmentLabels } = pathsResult[0] ? pathsResult[1] : { segmentLabels: {} };

      return { ...modifier, sourceName, requirements: modifierRequirements, targetLabels: pickTargetLabels([modifier.target, modifier.value], segmentLabels) };
    });
  },

  async createEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: {
      target: string;
      value: string;
      operator: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

        const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        const pathsService = TargetPathsService.initialize();
        const valueTypeResult = await pathsService.call("resolvePathValueType", rulesetId, body.target, "modifier");
        if (!valueTypeResult[0]) throw valueTypeResult[2];
        const inferredValueType = valueTypeResult[1];

        const rows = await Modifiers.create(tx, {
          sourceId: resolvedEntityId,
          sourceType: entityType,
          target: body.target,
          value: body.value,
          valueType: inferredValueType,
          operator: body.operator,
        });
        const modifier = rows[0];

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
  },

  async duplicateEntityModifier(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    sourceModifierId: string,
    body: {
      target: string;
      value: string;
      operator: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

        const sourceModifier = rulesetData.modifiersById.get(sourceModifierId);
        if (!sourceModifier || sourceModifier.sourceId !== effectiveEntityId || sourceModifier.sourceType !== entityType) {
          throw new NotFoundError("Source modifier not found for this entity");
        }

        const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        const pathsService = TargetPathsService.initialize();
        const valueTypeResult = await pathsService.call("resolvePathValueType", rulesetId, body.target, "modifier");
        if (!valueTypeResult[0]) throw valueTypeResult[2];
        const inferredValueType = valueTypeResult[1];

        const rows = await Modifiers.create(tx, {
          sourceId: resolvedEntityId,
          sourceType: entityType,
          target: body.target,
          value: body.value,
          valueType: inferredValueType,
          operator: body.operator,
        });
        const modifier = rows[0];

        const custMap = await fetchEntityCustomizations(tx, [sourceModifierId], "modifiers");
        const cust = custMap.get(sourceModifierId);
        if (cust) {
          await copyEntityCustomizations(tx, sourceModifierId, modifier.id, "modifiers", cust);
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

        const modifier = rulesetData.modifiersById.get(modifierId);
        if (!modifier || modifier.sourceId !== effectiveEntityId || modifier.sourceType !== entityType) {
          throw new NotFoundError("Modifier not found for this entity");
        }

        const customizationPolicy = new CustomizationsPolicy(session, modifier);
        await customizationPolicy.canUpdate();

        const resolvedModifierId = await cowEntityForCustomization(tx, rulesetId, "modifiers", modifierId);
        const resolvedModifier = resolvedModifierId !== modifierId
          ? await Modifiers.findOne(tx, { id: resolvedModifierId })
          : modifier;
        if (!resolvedModifier) {
          throw new NotFoundError("Resolved modifier not found after COW");
        }
        const resolvedEntityId = resolvedModifier.sourceId;

        const pathsService = TargetPathsService.initialize();
        const valueTypeResult = await pathsService.call("resolvePathValueType", rulesetId, body.target, "modifier");
        if (!valueTypeResult[0]) throw valueTypeResult[2];
        const inferredValueType = valueTypeResult[1];

        const expectedUpdatedAt = resolvedModifierId === modifierId ? body.updatedAt : undefined;
        const rows = await Modifiers.update(tx, {
          target: body.target,
          value: body.value,
          valueType: inferredValueType,
          operator: body.operator,
        }, { id: resolvedModifierId, expectedUpdatedAt });
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

        const modifier = rulesetData.modifiersById.get(modifierId);
        if (!modifier || modifier.sourceId !== effectiveEntityId || modifier.sourceType !== entityType) {
          throw new NotFoundError("Modifier not found for this entity");
        }

        const customizationPolicy = new CustomizationsPolicy(session, modifier);
        await customizationPolicy.canDelete();

        const resolvedModifierId = await cowEntityForCustomization(tx, rulesetId, "modifiers", modifierId);
        const resolvedModifier = resolvedModifierId !== modifierId
          ? await Modifiers.findOne(tx, { id: resolvedModifierId })
          : modifier;
        if (!resolvedModifier) {
          throw new NotFoundError("Resolved modifier not found after COW");
        }
        const resolvedEntityId = resolvedModifier.sourceId;

        const rows = await deleteModifiersWithCascade(tx, { ids: [resolvedModifierId] });
        const deletedModifier = rows[0];

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: deletedModifier.id,
          targetTable: getTableName(modifiersInCustomization),
          type: "deleteModifier",
          data: { rulesetId, entityName, entityType, target: modifier.target, value: modifier.value, operator: modifier.operator },
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
