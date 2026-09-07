import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { invalidateRulesetEntities } from "@/server/cache/rulesetCache.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { BadRequestError, ConflictError, InternalError, NotFoundError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Activities, Requirements } from "@/server/repositories/index.ts";
import BaseService from "@/server/services/BaseService.ts";
import { createActivityWithNotifications } from "@/server/services/activityNotifications.ts";
import { CustomizationsPolicy } from "@/server/services/policies/index.ts";
import { getRulesetPolicy } from "@/server/services/rulesets/helpers.ts";
import { cowEntityForCustomization, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { pickTargetLabels } from "@/shared/customization/target.ts";
import type { Session } from "@/shared/relations.ts";
import { getTableName } from "drizzle-orm";
import TargetPathsService from "./TargetPathsService.ts";

export const RequirementsMethods = {
  async getEntityRequirements(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      const resolvedId = rulesetData.canonicalize(entityId);
      await CustomizationsPolicy.sourceExists(resolvedId, entityType, rulesetData);
      // Compose step pre-merges sibling requirements (OR-chain-aware) into the
      // winner's bucket with entityId remapped. Filter by entityType.
      const allReqs = rulesetData.requirementsByEntity.get(resolvedId) ?? [];
      const requirements = allReqs.filter((r) => r.entityType === entityType);

      const result = await TargetPathsService.initialize().call("getTargetPathsWithLabels", rulesetId, "requirement");
      const { paths, segmentLabels } = result[0] ? result[1] : { paths: [], segmentLabels: {} };
      const pathMap = new Map(paths.map((p) => [p.path, p]));

      return requirements.map((r) => {
        const targetLabels = r.target ? pickTargetLabels([r.target, ...(r.value ? [r.value] : [])], segmentLabels) : {};
        if (!r.target || !r.value) return { ...r, valueLabel: null, targetLabels };
        const valueLabel = pathMap.get(r.target)?.possibleValues?.find((pv) => pv.value === r.value)?.label ?? null;
        return { ...r, valueLabel, targetLabels };
      });
    });
  },

  async createEntityRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: {
      level: string;
      target?: string;
      value?: string;
      valueType?: string;
      operator?: string;
      chainingOperator?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);
        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);

        const resolvedEntityId = await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        let requirement;
        if (body.target) {
          const pathsService = TargetPathsService.initialize();
          const validationResult = await pathsService.call(
            "validatePath",
            rulesetId,
            body.target,
            "requirement",
          );

          if (!validationResult[0]) {
            throw new BadRequestError("Failed to validate modifier path");
          }

          const validation = validationResult[1];
          if (!validation.isValid) {
            throw new BadRequestError(
              `Invalid modifier path: ${validation.errors[0]?.message || "Unknown error"}`,
            );
          }

          const allPathsResult = await pathsService.call("getTargetPathsWithLabels", rulesetId, "requirement");
          if (!allPathsResult[0]) {
            throw new BadRequestError("Failed to get requirement paths");
          }

          const pathDefinition = allPathsResult[1].paths.find((p) => p.path === body.target);
          if (!pathDefinition) {
            throw new BadRequestError(`Path not found: ${body.target}`);
          }

          const inferredValueType = pathDefinition.valueType;

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

        if (!requirement) {
          throw new InternalError("Failed to create requirement");
        }

        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: requirement.id,
          targetTable: getTableName(requirementsInCustomization),
          type: "createRequirement",
          data: { entityName, entityType, ...(body.target ? { target: body.target, value: body.value, operator: body.operator } : {}) },
        });

        return { ...requirement, resolvedEntityId };
      });
    });
    invalidateRulesetEntities(rulesetId);
    return result;
  },

  async updateEntityRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    requirementId: string,
    body: {
      level: string;
      target?: string;
      value?: string;
      valueType?: string;
      operator?: string;
      chainingOperator?: string;
      updatedAt?: string;
    },
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {

        (await getRulesetPolicy(tx, session, ruleset)).canUpdateEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);

        const requirement = await Requirements.findOne(tx, { id: requirementId });
        if (
          !requirement || requirement.entityId !== effectiveEntityId || requirement.entityType !== entityType
        ) {
          throw new NotFoundError("Requirement not found for this entity");
        }

        // Policy check BEFORE COW — sourceExists uses global db, not tx
        const customizationPolicy = new CustomizationsPolicy(session, requirement);
        await customizationPolicy.canUpdate();

        // COW the owning entity if this requirement is inherited
        const resolvedEntityId = entityType === "modifiers"
          ? await cowEntityForCustomization(tx, rulesetId, "modifiers", effectiveEntityId)
          : await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        let resolvedRequirementId = requirementId;
        if (resolvedEntityId !== effectiveEntityId) {
          const newRequirements = await Requirements.findManyByEntity(tx, { entityIds: [resolvedEntityId], entityType });
          const match = newRequirements.find(r =>
            r.level === requirement.level &&
            (r.target ?? null) === (requirement.target ?? null) &&
            (r.value ?? null) === (requirement.value ?? null) &&
            (r.valueType ?? null) === (requirement.valueType ?? null) &&
            (r.operator ?? null) === (requirement.operator ?? null) &&
            (r.chainingOperator ?? null) === (requirement.chainingOperator ?? null),
          );
          if (match) resolvedRequirementId = match.id;
        }

        let updatedRequirement;
        if (body.target) {
          const pathsService = TargetPathsService.initialize();
          const validationResult = await pathsService.call(
            "validatePath",
            rulesetId,
            body.target,
            "requirement",
          );

          if (!validationResult[0]) {
            throw new BadRequestError("Failed to validate modifier path");
          }

          const validation = validationResult[1];
          if (!validation.isValid) {
            throw new BadRequestError(
              `Invalid modifier path: ${validation.errors[0]?.message || "Unknown error"}`,
            );
          }

          const allPathsResult = await pathsService.call("getTargetPathsWithLabels", rulesetId, "requirement");
          if (!allPathsResult[0]) {
            throw new BadRequestError("Failed to get requirement paths");
          }

          const pathDefinition = allPathsResult[1].paths.find((p) => p.path === body.target);
          if (!pathDefinition) {
            throw new BadRequestError(`Path not found: ${body.target}`);
          }

          const inferredValueType = pathDefinition.valueType;
          const expectedUpdatedAt = resolvedRequirementId === requirementId ? body.updatedAt : undefined;
          const rows = await Requirements.update(tx, {
            level: body.level,
            target: body.target,
            value: body.value,
            valueType: inferredValueType,
            operator: body.operator,
          }, { id: resolvedRequirementId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) {
            throw new ConflictError(STALE_ENTITY_MESSAGE);
          }
          updatedRequirement = rows[0];
        } else {
          const expectedUpdatedAt = resolvedRequirementId === requirementId ? body.updatedAt : undefined;
          const rows = await Requirements.update(tx, {
            level: body.level,
            chainingOperator: body.chainingOperator,
          }, { id: resolvedRequirementId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) {
            throw new ConflictError(STALE_ENTITY_MESSAGE);
          }
          updatedRequirement = rows[0];
        }

        if (!updatedRequirement) {
          throw new InternalError("Failed to update requirement");
        }

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: updatedRequirement.id,
          targetTable: getTableName(requirementsInCustomization),
          type: "updateRequirement",
          data: { entityName, entityType, ...(body.target ? { target: body.target, value: body.value, operator: body.operator } : {}) },
        });

        return { ...updatedRequirement, resolvedEntityId };
      });
    });
    invalidateRulesetEntities(rulesetId);
    return result;
  },

  async deleteEntityRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    requirementId: string,
  ) {
    const result = await withTransaction(async (tx) => {
      return await withRulesetScope(tx, rulesetId, async ({ ruleset, rulesetData }) => {

        (await getRulesetPolicy(tx, session, ruleset)).canDeleteEntity();

        const effectiveEntityId = rulesetData.canonicalize(entityId);

        const requirement = await Requirements.findOne(tx, { id: requirementId });
        if (
          !requirement || requirement.entityId !== effectiveEntityId || requirement.entityType !== entityType
        ) {
          throw new NotFoundError("Requirement not found for this entity");
        }

        // Policy check BEFORE COW — sourceExists uses global db, not tx
        const customizationPolicy = new CustomizationsPolicy(session, requirement);
        await customizationPolicy.canDelete();

        const resolvedEntityId = entityType === "modifiers"
          ? await cowEntityForCustomization(tx, rulesetId, "modifiers", effectiveEntityId)
          : await cowEntityForCustomization(tx, rulesetId, entityType, effectiveEntityId);

        let resolvedRequirementId = requirementId;
        if (resolvedEntityId !== effectiveEntityId) {
          const newRequirements = await Requirements.findManyByEntity(tx, { entityIds: [resolvedEntityId], entityType });
          const match = newRequirements.find(r =>
            r.level === requirement.level &&
            (r.target ?? null) === (requirement.target ?? null) &&
            (r.value ?? null) === (requirement.value ?? null) &&
            (r.valueType ?? null) === (requirement.valueType ?? null) &&
            (r.operator ?? null) === (requirement.operator ?? null) &&
            (r.chainingOperator ?? null) === (requirement.chainingOperator ?? null),
          );
          if (match) resolvedRequirementId = match.id;
        }

        const rows = await Requirements.delete(tx, { id: resolvedRequirementId });
        const deletedRequirement = rows[0];

        await Activities.deleteByTarget(tx, { targetId: deletedRequirement.id, targetTable: getTableName(requirementsInCustomization) });

        const entityName = await CustomizationsPolicy.sourceExists(effectiveEntityId, entityType, rulesetData);
        await createActivityWithNotifications(tx, {
          userId: session.userId,
          targetId: deletedRequirement.id,
          targetTable: getTableName(requirementsInCustomization),
          type: "deleteRequirement",
          data: { rulesetId, entityName, entityType, ...(requirement.target ? { target: requirement.target, value: requirement.value, operator: requirement.operator } : {}) },
        });

        return { ...deletedRequirement, resolvedEntityId };
      });
    });
    invalidateRulesetEntities(rulesetId);
    return result;
  },
} as const;

class RequirementsService extends BaseService<typeof RequirementsMethods> {
  static initialize() {
    return new RequirementsService(RequirementsMethods);
  }
}

export default RequirementsService;
