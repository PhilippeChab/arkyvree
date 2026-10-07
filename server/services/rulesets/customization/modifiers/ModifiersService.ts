import { getTableName } from "drizzle-orm";

import { modifiersInCustomization } from "@/drizzle/schema.ts";
import { RulesetCache, type RulesetData, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { copyEntityCustomizations, fetchEntityCustomizations, RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Modifiers } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  checkCustomizedEntity,
  getCustomizableEntityName,
} from "@/server/services/rulesets/customization/customizableEntities.ts";
import {
  getTargetPathsWithLabels,
  resolvePathValueType,
} from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { pickTargetLabels } from "@/shared/customization/target.ts";
import type { Session } from "@/shared/relations.ts";

class ModifiersService {
  /** A modifier the entity is the source of, or a 404. */
  private findEntityModifier(rulesetData: RulesetData, entityType: string, entityId: string, modifierId: string) {
    const modifier = rulesetData.modifiersById.get(modifierId);
    if (!modifier || modifier.sourceId !== entityId || modifier.sourceType !== entityType)
      throw new NotFoundError("Modifier not found for this entity");

    return modifier;
  }

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
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

        if (sourceModifierId) {
          const sourceModifier = rulesetData.modifiersById.get(sourceModifierId);
          if (
            !sourceModifier ||
            sourceModifier.sourceId !== effectiveEntityId ||
            sourceModifier.sourceType !== entityType
          )
            throw new NotFoundError("Source modifier not found for this entity");
        }

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const resolvedEntityId = await edit.cowOwner(tx, entityType, effectiveEntityId);

        const inferredValueType = await resolvePathValueType(
          rulesetId,
          body.target,
          "modifier",
          body.operator,
          body.value,
          entityType,
        );

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
          if (cust) await copyEntityCustomizations(tx, modifier.id, "modifiers", cust);
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
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

        const modifier = this.findEntityModifier(rulesetData, entityType, effectiveEntityId, modifierId);

        await checkCustomizedEntity(modifier);

        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { resolvedEntityId, resolvedCustomizationId: resolvedModifierId } = await edit.cowCustomization(
          tx,
          entityType,
          effectiveEntityId,
          "modifier",
          modifierId,
        );

        // The database deletes the modifier's requirements with it
        const rows = await Modifiers.delete(tx, { ids: [resolvedModifierId] });
        const deletedModifier = rows[0];

        const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
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
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const effectiveEntityId = rulesetData.canonicalize(entityId);

      const parentName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
      const modifier = rulesetData.modifiersById.get(modifierId);
      if (!modifier) throw new NotFoundError("Modifier not found");

      const sourceName =
        modifier.sourceId === effectiveEntityId && modifier.sourceType === entityType
          ? parentName
          : await getCustomizableEntityName(modifier.sourceId, modifier.sourceType, rulesetData);

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
  }

  async getModifiers(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const resolvedId = rulesetData.canonicalize(entityId);
      await getCustomizableEntityName(resolvedId, entityType, rulesetData);
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
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
        (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

        const modifier = this.findEntityModifier(rulesetData, entityType, effectiveEntityId, modifierId);

        await checkCustomizedEntity(modifier);

        // COW the owning entity if this modifier is inherited
        const edit = new RulesetEdit(ruleset, rulesetData.cow);
        const { resolvedEntityId, resolvedCustomizationId: resolvedModifierId } = await edit.cowCustomization(
          tx,
          entityType,
          effectiveEntityId,
          "modifier",
          modifierId,
        );

        const inferredValueType = await resolvePathValueType(
          rulesetId,
          body.target,
          "modifier",
          body.operator,
          body.value,
          entityType,
        );

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
        if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

        const updatedModifier = rows[0];

        const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
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
    RulesetCache.invalidate(rulesetId);
    return result;
  }
}

export default new ModifiersService();
