import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { CustomizationEdit, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, InternalError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { Requirements } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
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
  /**
   * Refuses a requirement at a level its entity (`entityId`, as stored: a copy's once copied) holds another one at
   * (`requirementId`, the one an edit moves): the database keeps one per level.
   */
  private async refuseTakenLevel(tx: Db, entityType: string, entityId: string, level: string, requirementId?: string) {
    const taken = await Requirements.findOne(tx, { entityId, entityType, level });
    if (taken && taken.id !== requirementId) throw new ConflictError("A requirement at this level already exists");
  }

  async createRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: RequirementBody,
  ) {
    const result = await withTransaction(
      async (tx) =>
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => {
          const { ruleset, rulesetData } = scope;
          policy.canUpdateEntity();

          const catalogs = await RulesetViews.getTargetPathCatalogs(scope.ruleset, "requirement");
          const { entity, row } = Engine.for(scope).requirements(entityType, entityId).planCreate(catalogs, body);

          const edit = new CustomizationEdit(ruleset, rulesetData.cow);
          const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);
          await this.refuseTakenLevel(tx, entityType, resolvedEntityId, row.level);

          const rows = await Requirements.create(tx, { entityId: resolvedEntityId, entityType, ...row });
          const requirement = rows[0];
          if (!requirement) throw new InternalError("Failed to create requirement");

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: requirement.id,
            targetType: TARGET_TYPES.requirements,
            type: "createRequirement",
            data: { entityName: entity.name, entityType, ...conditionOf(row) },
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
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => {
          const { ruleset, rulesetData } = scope;
          policy.canDeleteEntity();

          const { entity, requirement } = Engine.for(scope)
            .requirements(entityType, entityId)
            .planDelete(requirementId);

          const edit = new CustomizationEdit(ruleset, rulesetData.cow);
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
            targetType: TARGET_TYPES.requirements,
            type: "deleteRequirement",
            data: { rulesetId, entityName: entity.name, entityType, ...conditionOf(requirement) },
          });

          return { ...deletedRequirement, resolvedEntityId };
        }),
    );
    RulesetViews.invalidateEntities(rulesetId);
    return result;
  }

  async getRequirements(session: Session, rulesetId: string, entityType: string, entityId: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope.ruleset, "requirement");
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
        await withReadableRuleset(tx, session, rulesetId, async (scope, policy) => {
          const { ruleset, rulesetData } = scope;
          policy.canUpdateEntity();

          const catalogs = await RulesetViews.getTargetPathCatalogs(scope.ruleset, "requirement");
          const requirements = Engine.for(scope).requirements(entityType, entityId);
          const { entity, row } = requirements.planEdit(catalogs, requirementId, body);

          // COW the owning entity if this requirement is inherited
          const edit = new CustomizationEdit(ruleset, rulesetData.cow);
          const { resolvedEntityId, resolvedCustomizationId: resolvedRequirementId } = await edit.cowCustomization(
            tx,
            entityType,
            entity.id,
            "requirement",
            requirementId,
          );

          await this.refuseTakenLevel(tx, entityType, resolvedEntityId, row.level, resolvedRequirementId);

          const expectedUpdatedAt = resolvedRequirementId === requirementId ? body.updatedAt : undefined;
          const rows = await Requirements.update(tx, row, { id: resolvedRequirementId, expectedUpdatedAt });
          if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

          const updatedRequirement = rows[0];
          if (!updatedRequirement) throw new InternalError("Failed to update requirement");

          await createActivityWithNotifications(tx, {
            userId: session.userId,
            targetId: updatedRequirement.id,
            targetType: TARGET_TYPES.requirements,
            type: "updateRequirement",
            data: { entityName: entity.name, entityType, ...conditionOf(row) },
          });

          return { ...updatedRequirement, resolvedEntityId };
        }),
    );
    RulesetViews.invalidateEntities(rulesetId);
    return result;
  }
}

export default new RequirementsService();
