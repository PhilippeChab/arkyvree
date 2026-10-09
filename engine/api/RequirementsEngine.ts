import { RequirementEdits } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";

import type { Module } from "./Modules.ts";

/** A requirement's create: the catalogs its value is checked against, and its body. */
type Create = Parameters<typeof RequirementEdits.planCreate>;

/** The engine bound to an entity's requirements (`entityType`, `entityId`): described, and what their saves store. */
export default class RequirementsEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly entityType: string,
    private readonly entityId: string,
  ) {}

  /** The entity's requirements of its type, as the view composes them, labeled as its page shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return RequirementEdits.describeAll(this.view, catalog, this.entityType, this.entityId);
  }

  /** A new requirement on the entity: the entity, and its row, its value checked against its path. */
  planCreate(catalogs: Create[2], body: Create[3]["body"]) {
    const change = { body, entityId: this.entityId, entityType: this.entityType };
    return RequirementEdits.planCreate(this.view, this.module.createTargetPaths(), catalogs, change);
  }

  /** Deleting one of the entity's own requirements: the entity and the requirement. */
  planDelete(requirementId: string) {
    return RequirementEdits.planDelete(this.view, this.entityType, this.entityId, requirementId);
  }

  /** One of the entity's own requirements' edit: the entity, the requirement, and its new row, checked. */
  planEdit(catalogs: Create[2], requirementId: string, body: Create[3]["body"]) {
    const change = { body, entityId: this.entityId, entityType: this.entityType, requirementId };
    return RequirementEdits.planEdit(this.view, this.module.createTargetPaths(), catalogs, change);
  }
}
