import { ModifierEdits } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";

import type { Module } from "./Modules.ts";

/** A modifier's create: the catalogs its value is checked against, and its body. */
type Create = Parameters<typeof ModifierEdits.planCreate>;

/** The engine bound to an entity's modifiers (`entityType`, `entityId`): described, and what their saves store. */
export default class ModifiersEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
    private readonly entityType: string,
    private readonly entityId: string,
  ) {}

  /** One of the entity's modifiers, as its page shows it: its own requirements, and its target's labels. */
  describe(catalog: TargetPathCatalog, modifierId: string) {
    return ModifierEdits.describeOne(this.view, catalog, this.entityType, this.entityId, modifierId);
  }

  /** The entity's modifiers of its type, as the view composes them, labeled as a list shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return ModifierEdits.describeAll(this.view, catalog, this.entityType, this.entityId);
  }

  /**
   * A new modifier on the entity, or a duplicate of one of its own (`sourceModifierId`): the entity, and its value
   * type, its operator and value checked against its path among the catalogs of a modifier's and a template's paths.
   */
  planCreate(catalogs: Create[2], body: Create[3]["body"], sourceModifierId?: string) {
    const change = { body, entityId: this.entityId, entityType: this.entityType, sourceModifierId };
    return ModifierEdits.planCreate(this.view, this.module.createTargetPaths(), catalogs, change);
  }

  /** Deleting one of the entity's own modifiers: the entity and the modifier. */
  planDelete(modifierId: string) {
    return ModifierEdits.planDelete(this.view, this.entityType, this.entityId, modifierId);
  }

  /** One of the entity's own modifiers' edit: the entity, the modifier, and its new value checked against its path. */
  planEdit(catalogs: Create[2], modifierId: string, body: Create[3]["body"]) {
    const change = { body, entityId: this.entityId, entityType: this.entityType, modifierId };
    return ModifierEdits.planEdit(this.view, this.module.createTargetPaths(), catalogs, change);
  }
}
