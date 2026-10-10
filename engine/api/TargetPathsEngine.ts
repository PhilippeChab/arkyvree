import { ModifierEdits, TargetLabels } from "@/engine/core/customizations/index.ts";
import type { TargetCatalogs } from "@/engine/core/paths/CategoryPaths.ts";
import type { PathQuery } from "@/engine/core/paths/PathCompletions.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";

import type { Module } from "./Modules.ts";

/** A modifier's save, as its form sends it. */
type ModifierBody = Parameters<typeof ModifierEdits.rowOf>[3];

/**
 * The engine bound to the ruleset's target paths: listed, completed, validated, and a modifier's row checked against
 * them.
 */
export default class TargetPathsEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /**
   * Modifiers as a list shows them, an entity's or a character's: their target's segments' labels, and their value's
   * name when their path names its values, among the catalog of a modifier's paths.
   */
  describeModifiers<T extends { target: string; value: string }>(catalog: TargetPathCatalog, modifiers: T[]) {
    return TargetLabels.describe(catalog, modifiers);
  }

  /** The completions of a partial path among a catalog's paths of `kind` (those an entity type takes), unpaged. */
  getCompletions(catalog: TargetPathCatalog, kind: TargetPathKind, query: PathQuery, entityType?: string) {
    return this.module.createTargetPaths().getCompletions(catalog, kind, query, entityType);
  }

  /** The ruleset's target paths of a kind, with their segments' labels: what a server caches and the rest take. */
  list(kind: TargetPathKind): TargetPathCatalog {
    return this.module.createTargetPaths().list(this.view.rulesetData, kind);
  }

  /**
   * The row a modifier's save stores on a source the view doesn't hold (`sourceType`: a character's): its target, its
   * operator, and its value as the sheet reads it, with their value type, checked against its path among the catalogs
   * of a modifier's paths (`paths`) and a template's (`templatePaths`). Refused as invalid with what's wrong.
   */
  planModifier(catalogs: TargetCatalogs, sourceType: string, body: ModifierBody) {
    return ModifierEdits.rowOf(this.module.createTargetPaths(), catalogs, sourceType, body);
  }

  /** A target path validated like a language server, among a catalog's paths (those an entity type takes). */
  validate(catalog: TargetPathCatalog, path: string, entityType?: string) {
    return this.module.createTargetPaths().validate(catalog, path, entityType);
  }
}
