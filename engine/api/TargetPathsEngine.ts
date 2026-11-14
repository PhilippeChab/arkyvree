import { NameBinder } from "@/engine/core/bindings/index.ts";
import { ModifierEdits, TargetLabels } from "@/engine/core/customizations/index.ts";
import type { TargetCatalogs } from "@/engine/core/paths/CategoryPaths.ts";
import type { PathQuery } from "@/engine/core/paths/PathCompletions.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";
import type { NameBinding } from "@/shared/relations.ts";

import type { Module } from "./Modules.ts";

/** A modifier's save, as its form sends it. */
type ModifierBody = Parameters<typeof ModifierEdits.rowOf>[3];

/** A modifier's edit, as its form sends it: its target and its value only where they changed. */
type ModifierEditBody = Parameters<typeof ModifierEdits.planChange>[3]["body"];

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
  describeModifiers<T extends { id: string; target: string; value: string }>(
    catalog: TargetPathCatalog,
    modifiers: T[],
    bindings: readonly NameBinding[] = [],
  ) {
    // Read by what their names mean, as a sheet reads them: a list shows each under the view's names, a gone one too
    return TargetLabels.describe(catalog, this.view.rulesetData.readRows(modifiers, bindings, true));
  }

  /** The completions of a partial path among a catalog's paths of `kind` (those an entity type takes), unpaged. */
  getCompletions(catalog: TargetPathCatalog, kind: TargetPathKind, query: PathQuery, entityType?: string) {
    return this.module.targetPaths.getCompletions(catalog, kind, query, entityType);
  }

  /** The ruleset's target paths of a kind, with their segments' labels: what a server caches and the rest take. */
  list(kind: TargetPathKind): TargetPathCatalog {
    return this.module.targetPaths.list(this.view.rulesetData, kind);
  }

  /**
   * The row a modifier's save stores on a source the view doesn't hold (`sourceType`: a character's): its target, its
   * operator, and its value as the sheet reads it, with their value type, checked against its path among the catalogs
   * of a modifier's paths (`paths`) and a template's (`templatePaths`). Refused as invalid with what's wrong.
   */
  planModifier(catalogs: TargetCatalogs, sourceType: string, body: ModifierBody) {
    const row = ModifierEdits.rowOf(this.module.targetPaths, catalogs, sourceType, body);
    return { bindings: new NameBinder(this.view.rulesetData, this.module.targetPaths).bind(row), row };
  }

  /**
   * An edit of a modifier on a source the view doesn't hold (`sourceType`: a character's), stored as `stored` with its
   * `bindings`: the row it stores, checked against its path among the catalogs of a modifier's paths and a template's,
   * and the bindings of the fields it writes (`rebound`). A field it isn't sent keeps its text as the view reads the
   * modifier, under its entities' names there, and what its names mean. Refused as invalid with what's wrong.
   */
  planModifierEdit(
    catalogs: TargetCatalogs,
    sourceType: string,
    edit: { bindings: readonly NameBinding[]; body: ModifierEditBody; stored: ModifierBody & { id: string } },
  ) {
    const binder = new NameBinder(this.view.rulesetData, this.module.targetPaths);
    const [current] = this.view.rulesetData.readRows([edit.stored], edit.bindings, true);
    const change = { body: edit.body, bound: edit.bindings, current };
    const bind = (condition: ModifierBody) => binder.bind(condition);
    return ModifierEdits.planChange(this.module.targetPaths, catalogs, sourceType, change, bind);
  }

  /** A target path validated like a language server, among a catalog's paths (those an entity type takes). */
  validate(catalog: TargetPathCatalog, path: string, entityType?: string) {
    return this.module.targetPaths.validate(catalog, path, entityType);
  }
}
