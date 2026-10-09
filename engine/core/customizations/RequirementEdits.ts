import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";

import CustomizedEntity from "./CustomizedEntity.ts";
import TargetLabels from "./TargetLabels.ts";

/** The target paths of a requirement and of a template, which a condition's value is checked against. */
interface Catalogs {
  paths: TargetPathCatalog;
  templatePaths: TargetPathCatalog;
}

/** A requirement's save, as its form sends it: a condition (`target`) or a group of conditions (`chainingOperator`). */
interface RequirementBody {
  chainingOperator?: string;
  level: string;
  operator?: string;
  target?: string;
  value?: string;
}

/** An entity's requirements: as its page lists them, and what their saves store, checked against their paths. */
export default class RequirementEdits {
  /** A requirement on the entity, its own or a visible sibling's contribution, or refused as not found. */
  private static findOwn(view: RulesetView, entityType: string, entityId: string, requirementId: string) {
    const requirement = view.rulesetData.requirementsByEntity
      .get(entityId)
      ?.find((row) => row.id === requirementId && row.entityType === entityType);
    if (!requirement) throw new RulesError("not-found", "Requirement not found for this entity");
    return requirement;
  }

  /**
   * The row a requirement's save stores: a condition's target, operator, value and value type (checked against its
   * path), or a group's chaining operator.
   */
  private static toRow(
    targetPaths: TargetPaths,
    catalogs: Catalogs,
    body: RequirementBody,
    kept?: { operator: string | null; value: string | null },
  ) {
    if (!body.target) return { chainingOperator: body.chainingOperator, level: body.level };
    // An update without a value keeps the stored one, checked against the target's type all the same
    const valueType = targetPaths.checkTargetValue(catalogs, {
      kind: "requirement",
      operator: body.operator ?? kept?.operator ?? undefined,
      target: body.target,
      value: body.value ?? kept?.value ?? undefined,
    });
    return { level: body.level, operator: body.operator, target: body.target, value: body.value, valueType };
  }

  /**
   * An entity's requirements of its type, as its view composes them (siblings' merged in, OR-chain-aware), each with
   * its target's segments' labels and its value's name when its path names its values.
   */
  static describeAll(view: RulesetView, catalog: TargetPathCatalog, entityType: string, entityId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    const requirements = (view.rulesetData.requirementsByEntity.get(entity.id) ?? []).filter(
      (requirement) => requirement.entityType === entityType,
    );
    const pathMap = new Map(catalog.paths.map((path) => [path.path, path]));
    return requirements.map((r) => {
      const targetLabels = r.target
        ? TargetLabels.pick([r.target, ...(r.value ? [r.value] : [])], catalog.segmentLabels)
        : {};
      if (!r.target || !r.value) return { ...r, valueLabel: null, targetLabels };
      const valueLabel = pathMap.get(r.target)?.possibleValues?.find((pv) => pv.value === r.value)?.label ?? null;
      return { ...r, valueLabel, targetLabels };
    });
  }

  /** A new requirement on an entity: the entity as the view has it, and the row its save stores. */
  static planCreate(
    view: RulesetView,
    targetPaths: TargetPaths,
    catalogs: Catalogs,
    change: { body: RequirementBody; entityId: string; entityType: string },
  ) {
    const entity = CustomizedEntity.find(view, change.entityType, change.entityId);
    return { entity, row: RequirementEdits.toRow(targetPaths, catalogs, change.body) };
  }

  /** Deleting one of an entity's requirements: the entity and the requirement, as the view has them. */
  static planDelete(view: RulesetView, entityType: string, entityId: string, requirementId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    return { entity, requirement: RequirementEdits.findOwn(view, entityType, entity.id, requirementId) };
  }

  /** An edit of one of an entity's requirements: the entity and the requirement, and the row its save stores. */
  static planEdit(
    view: RulesetView,
    targetPaths: TargetPaths,
    catalogs: Catalogs,
    change: { body: RequirementBody; entityId: string; entityType: string; requirementId: string },
  ) {
    const { entity, requirement } = RequirementEdits.planDelete(
      view,
      change.entityType,
      change.entityId,
      change.requirementId,
    );
    return { entity, requirement, row: RequirementEdits.toRow(targetPaths, catalogs, change.body, requirement) };
  }
}
