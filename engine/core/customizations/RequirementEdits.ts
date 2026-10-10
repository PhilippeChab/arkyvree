import type { TargetCatalogs, TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { Requirement } from "@/shared/relations.ts";

import CustomizationEdits from "./CustomizationEdits.ts";
import TargetLabels from "./TargetLabels.ts";

/** A requirement's save, as its form sends it: a condition (`target`) or a group of conditions (`chainingOperator`). */
type RequirementBody = { chainingOperator?: string; level: string; operator?: string; target?: string; value?: string };

/** An entity's requirements: as its page lists them, and what their saves store, checked against their paths. */
export default class RequirementEdits extends CustomizationEdits<Requirement> {
  protected readonly label = "Requirement";

  /**
   * The row a requirement's save stores: a condition's target, operator, value and value type (checked against its
   * path), or a group's chaining operator.
   */
  private toRow(
    targetPaths: TargetPaths,
    catalogs: TargetCatalogs,
    body: RequirementBody,
    kept?: { operator: string | null; value: string | null },
  ) {
    if (!body.target) return { chainingOperator: body.chainingOperator, level: body.level };
    // An update without a value keeps the stored one, checked against the target's type all the same
    const valueType = targetPaths.checkValue(catalogs, {
      kind: "requirement",
      operator: body.operator ?? kept?.operator ?? undefined,
      target: body.target,
      value: body.value ?? kept?.value ?? undefined,
    });
    return { level: body.level, operator: body.operator, target: body.target, value: body.value, valueType };
  }

  /** The entity's requirements of its type: its own, and its siblings' (the view composes them, OR-chain-aware). */
  protected rowsOf(entityId: string) {
    const requirements = this.view.rulesetData.requirementsByEntity.get(entityId) ?? [];
    return requirements.filter((requirement) => requirement.entityType === this.entityType);
  }

  /** The entity's requirements of its type, as the view composes them, labeled as its page shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return TargetLabels.describe(catalog, this.rowsOf(this.entity.id));
  }

  /** A new requirement on the entity: the entity as the view has it, and the row it stores. */
  planCreate(targetPaths: TargetPaths, catalogs: TargetCatalogs, body: RequirementBody) {
    return { entity: this.entity, row: this.toRow(targetPaths, catalogs, body) };
  }

  /** Deleting one of the entity's requirements: the entity and the requirement, as the view has them. */
  planDelete(requirementId: string) {
    const { entity } = this;
    return { entity, requirement: this.findOwn(entity.id, requirementId) };
  }

  /** An edit of one of the entity's requirements: the entity and the requirement, and the row it stores. */
  planEdit(targetPaths: TargetPaths, catalogs: TargetCatalogs, requirementId: string, body: RequirementBody) {
    const plan = this.planDelete(requirementId);
    return { ...plan, row: this.toRow(targetPaths, catalogs, body, plan.requirement) };
  }
}
