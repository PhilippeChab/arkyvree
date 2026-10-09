import { getTableName } from "drizzle-orm";

import { requirementsInCustomization } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import {
  readTargetPathCatalogs,
  readTargetPaths,
  RulesetEdit,
  RulesetViews,
  withRulesetScope,
} from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, InternalError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Requirements } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { RulesetsPolicy } from "@/server/services/policies/index.ts";
import { checkCustomizedEntity } from "@/server/services/rulesets/customization/customizableEntities.ts";
import type { Session } from "@/shared/relations.ts";

/** A requirement's body: a condition (`target`, its operator and value) or a group of conditions (`chainingOperator`). */
interface RequirementBody {
  chainingOperator?: string;
  level: string;
  operator?: string;
  target?: string;
  value?: string;
  valueType?: string;
}

/** What a history records of a requirement: its condition, when it's one. */
function conditionOf(requirement: { operator?: string | null; target?: string | null; value?: string | null }) {
  return requirement.target
    ? { target: requirement.target, value: requirement.value, operator: requirement.operator }
    : {};
}

class RequirementsService {
  async createRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: RequirementBody,
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const catalogs = await readTargetPathCatalogs(rulesetId, "requirement");
          const { entity, row } = Engine.for(scope).requirements(entityType, entityId).planCreate(catalogs, body);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);

          const rows = await Requirements.create(tx, { entityId: resolvedEntityId, entityType, ...row });
          const requirement = rows[0];
          if (!requirement) throw new InternalError("Failed to create requirement");

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: requirement.id,
            targetTable: getTableName(requirementsInCustomization),
            type: "createRequirement",
            data: { entityName: entity.name, entityType, ...conditionOf(body) },
          });

          return { ...requirement, resolvedEntityId };
        }),
    );
    RulesetViews.invalidateEntities(rulesetId);
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
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canDeleteEntity();

          const { entity, requirement } = Engine.for(scope)
            .requirements(entityType, entityId)
            .planDelete(requirementId);
          // Before the copy-on-write: the lookup reads the shared db, not tx
          await checkCustomizedEntity(requirement);

          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedRequirementId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "requirement",
            requirementId,
          );

          const rows = await Requirements.delete(tx, { id: resolvedRequirementId });
          const deletedRequirement = rows[0];

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: deletedRequirement.id,
            targetTable: getTableName(requirementsInCustomization),
            type: "deleteRequirement",
            data: { rulesetId, entityName: entity.name, entityType, ...conditionOf(requirement) },
          });

          return { ...deletedRequirement, resolvedEntityId };
        }),
    );
    RulesetViews.invalidateEntities(rulesetId);
    return result;
  }

  async getRequirements(rulesetId: string, entityType: string, entityId: string) {
    return await withRulesetScope(db, rulesetId, async (scope) => {
      const catalog = await readTargetPaths(rulesetId, "requirement");
      return Engine.for(scope).requirements(entityType, entityId).describeAll(catalog);
    });
  }

  async updateRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    requirementId: string,
    body: RequirementBody & { updatedAt?: string },
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withRulesetScope(tx, rulesetId, async (scope) => {
          const { ruleset, rulesetData } = scope;
          (await RulesetsPolicy.for(tx, session, ruleset)).canUpdateEntity();

          const catalogs = await readTargetPathCatalogs(rulesetId, "requirement");
          const requirements = Engine.for(scope).requirements(entityType, entityId);
          const { entity, requirement, row } = requirements.planEdit(catalogs, requirementId, body);
          // Before the copy-on-write: the lookup reads the shared db, not tx
          await checkCustomizedEntity(requirement);

          // COW the owning entity if this requirement is inherited
          const edit = new RulesetEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedRequirementId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "requirement",
            requirementId,
          );

          const expectedUpdatedAt = resolvedRequirementId === requirementId ? body.updatedAt : undefined;
          const rows = await Requirements.update(tx, row, { id: resolvedRequirementId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedRequirement = rows[0];
          if (!updatedRequirement) throw new InternalError("Failed to update requirement");

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: updatedRequirement.id,
            targetTable: getTableName(requirementsInCustomization),
            type: "updateRequirement",
            data: { entityName: entity.name, entityType, ...conditionOf(body) },
          });

          return { ...updatedRequirement, resolvedEntityId };
        }),
    );
    RulesetViews.invalidateEntities(rulesetId);
    return result;
  }
}

export default new RequirementsService();
