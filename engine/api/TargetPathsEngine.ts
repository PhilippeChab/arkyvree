import { ModifierEdits } from "@/engine/core/customizations/index.ts";
import type { PathQuery, RulesetView, TargetCheck } from "@/engine/core/types.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";

import type { Module } from "./Modules.ts";

/** The engine bound to the ruleset's target paths: listed, completed, validated, and a value checked against them. */
export default class TargetPathsEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /**
   * The value type of the path a modifier or requirement targets, among the catalog of its kind (`paths`), its operator
   * and value checked against it, a template against the paths a template reads (`templatePaths`): refused as invalid
   * with what's wrong.
   */
  checkValue(catalogs: { paths: TargetPathCatalog; templatePaths: TargetPathCatalog }, check: TargetCheck) {
    return this.module.createTargetPaths().checkTargetValue(catalogs, check);
  }

  /**
   * Modifiers as a list shows them, an entity's or a character's: their target's segments' labels, and their value's
   * name when their path names its values, among the catalog of a modifier's paths.
   */
  describeModifiers<T extends { target: string; value: string }>(catalog: TargetPathCatalog, modifiers: T[]) {
    return ModifierEdits.describe(catalog, modifiers);
  }

  /** The completions of a partial path among a catalog's paths of `kind` (those an entity type takes), unpaged. */
  getCompletions(catalog: TargetPathCatalog, kind: TargetPathKind, query: PathQuery, entityType?: string) {
    return this.module.createTargetPaths().completeTargetPath(catalog, kind, query, entityType);
  }

  /** The ruleset's target paths of a kind, with their segments' labels: what a server caches and the rest take. */
  list(kind: TargetPathKind): TargetPathCatalog {
    return this.module.createTargetPaths().getTargetPathsAndLabels(this.view.rulesetData, kind);
  }

  /** A target path validated like a language server, among a catalog's paths (those an entity type takes). */
  validate(catalog: TargetPathCatalog, path: string, entityType?: string) {
    return this.module.createTargetPaths().validateTargetPath(catalog, path, entityType);
  }
}
