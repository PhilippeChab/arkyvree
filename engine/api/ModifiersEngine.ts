import { ModifierEdits } from "@/engine/core/customizations/index.ts";
import type { TargetCatalogs } from "@/engine/core/paths/CategoryPaths.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";

import type { Module } from "./Modules.ts";

/** A modifier's save, as its form sends it. */
type ModifierBody = Parameters<ModifierEdits["planCreate"]>[2];

/** The engine bound to an entity's modifiers (`entityType`, `entityId`): described, and what their saves store. */
export default class ModifiersEngine {
  constructor(
    view: RulesetView,
    private readonly module: Module,
    entityType: string,
    entityId: string,
  ) {
    this.modifiers = new ModifierEdits(view, entityType, entityId);
  }

  /** The entity's modifiers, which its operations ask. */
  private readonly modifiers: ModifierEdits;

  /** One of the entity's modifiers, as its page shows it: its own requirements, and its target's labels. */
  describe(catalog: TargetPathCatalog, modifierId: string) {
    return this.modifiers.describe(catalog, modifierId);
  }

  /** The entity's modifiers of its type, as the view composes them, labeled as a list shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return this.modifiers.describeAll(catalog);
  }

  /**
   * A new modifier on the entity, or a duplicate of one of its own (`sourceModifierId`): the entity, and the row its
   * save stores, its operator and value checked against its path among the catalogs of a modifier's and a template's
   * paths.
   */
  planCreate(catalogs: TargetCatalogs, body: ModifierBody, sourceModifierId?: string) {
    return this.modifiers.planCreate(this.module.createTargetPaths(), catalogs, body, sourceModifierId);
  }

  /** Deleting one of the entity's own modifiers: the entity and the modifier. */
  planDelete(modifierId: string) {
    return this.modifiers.planDelete(modifierId);
  }

  /** One of the entity's own modifiers' edit: the entity, the modifier, and the row its save stores, checked. */
  planEdit(catalogs: TargetCatalogs, modifierId: string, body: ModifierBody) {
    return this.modifiers.planEdit(this.module.createTargetPaths(), catalogs, modifierId, body);
  }
}
