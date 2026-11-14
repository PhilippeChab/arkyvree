import { RequirementEdits } from "@/engine/core/customizations/index.ts";
import type { TargetCatalogs } from "@/engine/core/paths/CategoryPaths.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { NameBinding } from "@/shared/relations.ts";

import type { Module } from "./Modules.ts";

/** A requirement's save, as its form sends it. */
type RequirementBody = Parameters<RequirementEdits["planCreate"]>[2];

/** The engine bound to an entity's requirements (`entityType`, `entityId`): described, and what their saves store. */
export default class RequirementsEngine {
  constructor(
    view: RulesetView,
    private readonly module: Module,
    entityType: string,
    entityId: string,
  ) {
    this.requirements = new RequirementEdits(view, entityType, entityId);
  }

  /** The entity's requirements, which its operations ask. */
  private readonly requirements: RequirementEdits;

  /** The entity's requirements of its type, as the view composes them, labeled as its page shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return this.requirements.describeAll(catalog);
  }

  /** A new requirement on the entity: the entity, and its row, its value checked against its path. */
  planCreate(catalogs: TargetCatalogs, body: RequirementBody) {
    return this.requirements.planCreate(this.module.targetPaths, catalogs, body);
  }

  /** Deleting one of the entity's own requirements: the entity and the requirement. */
  planDelete(requirementId: string) {
    return this.requirements.planDelete(requirementId);
  }

  /**
   * One of the entity's own requirements' edit: the entity, the requirement, its new row, checked, and the bindings of
   * the fields it writes; a field it isn't sent keeps its text and what its stored bindings (`bound`) mean.
   */
  planEdit(catalogs: TargetCatalogs, requirementId: string, body: RequirementBody, bound: readonly NameBinding[]) {
    return this.requirements.planEdit(this.module.targetPaths, catalogs, requirementId, body, bound);
  }
}
