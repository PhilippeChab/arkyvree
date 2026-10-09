import { getTableName } from "drizzle-orm";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import type { RulesetData } from "@/engine/index.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { RulesetEdit } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, InternalError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Requirements } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import {
  checkCustomizedEntity,
  getCustomizableEntityName,
} from "@/server/services/rulesets/customization/customizableEntities.ts";
import {
  getTargetPathsWithLabels,
  pickTargetLabels,
  resolvePathValueType,
} from "@/server/services/rulesets/customization/targetPaths/index.ts";
import type { Session } from "@/shared/relations.ts";

class RequirementsService {
  /** A requirement on the entity, its own or a visible sibling's contribution, or a 404. */
  private findEntityRequirement(rulesetData: RulesetData, entityType: string, entityId: string, requirementId: string) {
    const requirement = rulesetData.requirementsByEntity
      .get(entityId)
      ?.find((row) => row.id === requirementId && row.entityType === entityType);
    if (!requirement) throw new NotFoundError("Requirement not found for this entity");
    return requirement;
  }

  async createRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: {
      chainingOperator?: string;
      level: string;
      operator?: string;
      target?: string;
      value?: string;
      valueType?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const effectiveEntityId = rulesetData.canonicalize(entityId);
          const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedEntityId = await edit.cowOwner(tx, entityType, effectiveEntityId);

          let requirement;
          if (body.target) {
            const inferredValueType = await resolvePathValueType(
              rulesetId,
              body.target,
              "requirement",
              body.operator,
              body.value,
            );

            const rows = await Requirements.create(tx, {
              entityId: resolvedEntityId,
              entityType,
              level: body.level,
              target: body.target,
              value: body.value,
              valueType: inferredValueType,
              operator: body.operator,
            });
            requirement = rows[0];
          } else {
            const rows = await Requirements.create(tx, {
              entityId: resolvedEntityId,
              entityType,
              level: body.level,
              chainingOperator: body.chainingOperator,
            });
            requirement = rows[0];
          }

          if (!requirement) throw new InternalError("Failed to create requirement");

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: requirement.id,
            targetTable: getTableName(requirementsInCustomization),
            type: "createRequirement",
            data: {
              entityName,
              entityType,
              ...(body.target ? { target: body.target, value: body.value, operator: body.operator } : {}),
            },
          });

          return { ...requirement, resolvedEntityId };
        }),
    );
    RulesetCache.invalidateEntities(rulesetId);
    return result;
  }

  async deleteRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    requirementId: string,
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

          const effectiveEntityId = rulesetData.canonicalize(entityId);
          await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

          const requirement = this.findEntityRequirement(rulesetData, entityType, effectiveEntityId, requirementId);

          // Before the copy-on-write: the lookup reads the shared db, not tx
          await checkCustomizedEntity(requirement);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedRequirementId } = await edit.cowCustomization(
            tx,
            entityType,
            effectiveEntityId,
            "requirement",
            requirementId,
          );

          const rows = await Requirements.delete(tx, { id: resolvedRequirementId });
          const deletedRequirement = rows[0];

          const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: deletedRequirement.id,
            targetTable: getTableName(requirementsInCustomization),
            type: "deleteRequirement",
            data: {
              rulesetId,
              entityName,
              entityType,
              ...(requirement.target
                ? { target: requirement.target, value: requirement.value, operator: requirement.operator }
                : {}),
            },
          });

          return { ...deletedRequirement, resolvedEntityId };
        }),
    );
    RulesetCache.invalidateEntities(rulesetId);
    return result;
  }

  async getRequirements(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const resolvedId = rulesetData.canonicalize(entityId);
      await getCustomizableEntityName(resolvedId, entityType, rulesetData);
      // Compose step pre-merges sibling requirements (OR-chain-aware) into the
      // winner's bucket with entityId remapped. Filter by entityType.
      const allReqs = rulesetData.requirementsByEntity.get(resolvedId) ?? [];
      const requirements = allReqs.filter((r) => r.entityType === entityType);

      const { paths, segmentLabels } = await getTargetPathsWithLabels(rulesetId, "requirement");
      const pathMap = new Map(paths.map((p) => [p.path, p]));

      return requirements.map((r) => {
        const targetLabels = r.target ? pickTargetLabels([r.target, ...(r.value ? [r.value] : [])], segmentLabels) : {};
        if (!r.target || !r.value) return { ...r, valueLabel: null, targetLabels };
        const valueLabel = pathMap.get(r.target)?.possibleValues?.find((pv) => pv.value === r.value)?.label ?? null;
        return { ...r, valueLabel, targetLabels };
      });
    });
  }

  async updateRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    requirementId: string,
    body: {
      chainingOperator?: string;
      level: string;
      operator?: string;
      target?: string;
      updatedAt?: string;
      value?: string;
      valueType?: string;
    },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const effectiveEntityId = rulesetData.canonicalize(entityId);
          await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);

          const requirement = this.findEntityRequirement(rulesetData, entityType, effectiveEntityId, requirementId);

          // Before the copy-on-write: the lookup reads the shared db, not tx
          await checkCustomizedEntity(requirement);

          // COW the owning entity if this requirement is inherited
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedRequirementId } = await edit.cowCustomization(
            tx,
            entityType,
            effectiveEntityId,
            "requirement",
            requirementId,
          );

          let updatedRequirement;
          if (body.target) {
            // An update without a value keeps the stored one, checked against the target's type all the same
            const value = body.value ?? requirement.value ?? undefined;
            const inferredValueType = await resolvePathValueType(
              rulesetId,
              body.target,
              "requirement",
              body.operator ?? requirement.operator ?? undefined,
              value,
            );
            const expectedUpdatedAt = resolvedRequirementId === requirementId ? body.updatedAt : undefined;
            const rows = await Requirements.update(
              tx,
              {
                level: body.level,
                target: body.target,
                value: body.value,
                valueType: inferredValueType,
                operator: body.operator,
              },
              { id: resolvedRequirementId, expectedUpdatedAt },
            );
            if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

            updatedRequirement = rows[0];
          } else {
            const expectedUpdatedAt = resolvedRequirementId === requirementId ? body.updatedAt : undefined;
            const rows = await Requirements.update(
              tx,
              {
                level: body.level,
                chainingOperator: body.chainingOperator,
              },
              { id: resolvedRequirementId, expectedUpdatedAt },
            );
            if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

            updatedRequirement = rows[0];
          }

          if (!updatedRequirement) throw new InternalError("Failed to update requirement");

          const entityName = await getCustomizableEntityName(effectiveEntityId, entityType, rulesetData);
          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: updatedRequirement.id,
            targetTable: getTableName(requirementsInCustomization),
            type: "updateRequirement",
            data: {
              entityName,
              entityType,
              ...(body.target ? { target: body.target, value: body.value, operator: body.operator } : {}),
            },
          });

          return { ...updatedRequirement, resolvedEntityId };
        }),
    );
    RulesetCache.invalidateEntities(rulesetId);
    return result;
  }
}

export default new RequirementsService();
