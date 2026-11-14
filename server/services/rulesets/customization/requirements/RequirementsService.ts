import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { CustomizationEdit, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, InternalError, STALE_ENTITY_MESSAGE } from "@/server/errors/index.ts";
import { NameBindings, Requirements } from "@/server/repositories/index.ts";
import { createContentActivityWithNotifications } from "@/server/services/activities/index.ts";
import { withReadableRuleset } from "@/server/services/rulesets/readableRuleset.ts";
import { withRulesetWrite } from "@/server/services/writes/index.ts";
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
   * The level a new or an edited requirement takes: the one asked for, unless a condition its page doesn't list holds it (one the
   * view leaves out because what it names is gone, which the client couldn't see: `listed` is what the page lists), in
   * which case the next one free beside it.
   */
  private async pickFreeLevel(tx: Db, entityType: string, entityId: string, level: string, listed: string[]) {
    if (listed.includes(level)) return level;
    const stored = (await Requirements.findMany(tx, { entityIds: [entityId], entityType })).map((r) => r.level);
    const prefix = level.slice(0, level.lastIndexOf(".") + 1);
    // Inside a group its page doesn't list, however deep, nothing is free to the client: any level there is refused
    // as taken
    const parts = level.split(".");
    const ancestors = parts.slice(1).map((_, index) => parts.slice(0, index + 1).join("."));
    if (ancestors.some((ancestor) => stored.includes(ancestor) && !listed.includes(ancestor)))
      throw new ConflictError("A requirement at this level already exists");
    if (!stored.includes(level)) return level;
    const beside = stored.filter((other) => other.startsWith(prefix) && !other.slice(prefix.length).includes("."));
    return `${prefix}${Math.max(...beside.map((other) => Number(other.slice(prefix.length)) || 0)) + 1}`;
  }

  /**
   * Refuses turning a group (at `level`) of an entity's requirements (`entityId`, as stored: a copy's once copied) into
   * a condition while the entity stores requirements under it, those its page lists and those the view leaves out (a
   * condition whose entity is gone): a condition groups none, and the evaluation would drop them.
   */
  private async refuseGroupedUnder(tx: Db, entityType: string, entityId: string, level: string) {
    const stored = await Requirements.findMany(tx, { entityIds: [entityId], entityType });
    if (stored.some((requirement) => requirement.level.startsWith(`${level}.`))) {
      throw new ConflictError(
        "A group with requirements under it can't become a condition: delete the requirements under it first",
      );
    }
  }

  /**
   * Refuses a requirement at a level its entity (`entityId`, as stored: a copy's once copied) holds another one at: the
   * database keeps one per level. An edit (`edited`: the requirement it moves, and the version it started from) keeps
   * its own level, and one started from a stale version is told so first, its refresh showing the level taken.
   */
  private async refuseTakenLevel(
    tx: Db,
    entityType: string,
    entityId: string,
    level: string,
    edited?: { expectedUpdatedAt?: string; id: string },
  ) {
    const taken = await Requirements.findOne(tx, { entityId, entityType, level });
    if (!taken || taken.id === edited?.id) return;
    if (edited?.expectedUpdatedAt && !(await Requirements.exists(tx, edited)))
      throw new ConflictError(STALE_ENTITY_MESSAGE);
    throw new ConflictError("A requirement at this level already exists");
  }

  async createRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    body: RequirementBody,
  ) {
    return await withRulesetWrite(
      session,
      rulesetId,
      async (tx, scope, policy) => {
        policy.canUpdateEntity();

        const catalogs = await RulesetViews.getTargetPathCatalogs(scope, "requirement");
        const requirements = Engine.for(scope).requirements(entityType, entityId);
        const { bindings, entity, levels, row } = requirements.planCreate(catalogs, body);

        const edit = new CustomizationEdit(scope);
        const resolvedEntityId = await edit.cowOwner(tx, entityType, entity.id);
        const level = await this.pickFreeLevel(tx, entityType, resolvedEntityId, row.level, levels);
        await this.refuseTakenLevel(tx, entityType, resolvedEntityId, level);

        const rows = await Requirements.create(tx, { entityId: resolvedEntityId, entityType, ...row, level });
        const requirement = rows[0];
        if (!requirement) throw new InternalError("Failed to create requirement");
        await NameBindings.createMany(
          tx,
          bindings.map((binding) => ({ ...binding, requirementId: requirement.id })),
        );

        await createContentActivityWithNotifications(tx, scope.ruleset, {
          userId: session.userId,
          targetId: requirement.id,
          targetType: TARGET_TYPES.requirements,
          type: "createRequirement",
          data: { entityName: entity.name, ...conditionOf(row) },
        });

        return { ...requirement, resolvedEntityId };
      },
      { drops: "entities" },
    );
  }

  async deleteRequirement(
    session: Session,
    rulesetId: string,
    entityType: string,
    entityId: string,
    requirementId: string,
  ) {
    return await withRulesetWrite(
      session,
      rulesetId,
      async (tx, scope, policy) => {
        policy.canDeleteEntity();
        await new CustomizationEdit(scope).refuseCopiedSince(tx, entityType, entityId, "requirement", requirementId);

        const { entity, requirement } = Engine.for(scope).requirements(entityType, entityId).planDelete(requirementId);

        const edit = new CustomizationEdit(scope);
        const { customization, resolvedEntityId } = await edit.cowCustomization(
          tx,
          entityType,
          entity.id,
          "requirement",
          requirementId,
        );

        const rows = await Requirements.delete(tx, { id: customization.id });
        const deletedRequirement = rows[0];

        await createContentActivityWithNotifications(tx, scope.ruleset, {
          userId: session.userId,
          targetId: deletedRequirement.id,
          targetType: TARGET_TYPES.requirements,
          type: "deleteRequirement",
          data: { rulesetId, entityName: entity.name, ...conditionOf(requirement) },
        });

        return { ...deletedRequirement, resolvedEntityId };
      },
      { drops: "entities" },
    );
  }

  async getRequirements(session: Session, rulesetId: string, entityType: string, entityId: string) {
    return await withReadableRuleset(db, session, rulesetId, async (scope) => {
      const catalog = await RulesetViews.getTargetPaths(scope, "requirement");
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
    return await withRulesetWrite(
      session,
      rulesetId,
      async (tx, scope, policy) => {
        policy.canUpdateEntity();
        await new CustomizationEdit(scope).refuseCopiedSince(tx, entityType, entityId, "requirement", requirementId);

        const catalogs = await RulesetViews.getTargetPathCatalogs(scope, "requirement");
        const requirements = Engine.for(scope).requirements(entityType, entityId);
        const plan = requirements.planEdit(catalogs, requirementId, body);
        const { bindings, entity, levels, row: sent, ungroupedLevel } = plan;

        // COW the owning entity if this requirement is inherited
        const edit = new CustomizationEdit(scope);
        const { customization, resolvedEntityId } = await edit.cowCustomization(
          tx,
          entityType,
          entity.id,
          "requirement",
          requirementId,
        );

        if (ungroupedLevel !== null) await this.refuseGroupedUnder(tx, entityType, resolvedEntityId, ungroupedLevel);
        const expectedUpdatedAt = await customization.expected(tx, body.updatedAt);
        // A level a condition its page doesn't list holds is free to the client: the edit takes the next one beside it
        const row = { ...sent, level: await this.pickFreeLevel(tx, entityType, resolvedEntityId, sent.level, levels) };
        await this.refuseTakenLevel(tx, entityType, resolvedEntityId, row.level, {
          id: customization.id,
          expectedUpdatedAt,
        });

        const rows = await Requirements.update(tx, row, { id: customization.id, expectedUpdatedAt });
        if (expectedUpdatedAt && rows.length === 0) throw new ConflictError(STALE_ENTITY_MESSAGE);

        const updatedRequirement = rows[0];
        if (!updatedRequirement) throw new InternalError("Failed to update requirement");
        // Its names are kept anew, with the text it now stores; a save that changed no text keeps them
        if (bindings) {
          await NameBindings.delete(tx, { requirementId: updatedRequirement.id });
          await NameBindings.createMany(
            tx,
            bindings.map((binding) => ({ ...binding, requirementId: updatedRequirement.id })),
          );
        }

        await createContentActivityWithNotifications(tx, scope.ruleset, {
          userId: session.userId,
          targetId: updatedRequirement.id,
          targetType: TARGET_TYPES.requirements,
          type: "updateRequirement",
          data: { entityName: entity.name, ...conditionOf(row) },
        });

        return { ...updatedRequirement, resolvedEntityId };
      },
      { drops: "entities" },
    );
  }
}

export default new RequirementsService();
