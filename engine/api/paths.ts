import type { PathQuery, RulesetView, TargetCheck } from "@/engine/core/types.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";

import { getRulesetModule } from "./modules.ts";

/** The ruleset's target paths: what its module's paths are made of. */
function targetPathsOf(view: RulesetView) {
  return getRulesetModule(view.ruleset.baseRules).createTargetPaths();
}

/**
 * The value type of the path a modifier or requirement targets, among the catalog of its kind (`paths`), its operator
 * and value checked against it, a template against the paths a template reads (`templatePaths`): refused as invalid
 * with what's wrong.
 */
export function checkTargetValue(
  view: RulesetView,
  catalogs: { paths: TargetPathCatalog; templatePaths: TargetPathCatalog },
  check: TargetCheck,
) {
  return targetPathsOf(view).checkTargetValue(catalogs, check);
}

/** The completions of a partial path among a catalog's paths of `kind`, unpaged. */
export function getTargetPathCompletions(
  view: RulesetView,
  catalog: TargetPathCatalog,
  kind: TargetPathKind,
  query: PathQuery,
) {
  return targetPathsOf(view).completeTargetPath(catalog, kind, query);
}

/** The ruleset's target paths of a kind, with their segments' labels: what a server caches and the other ops take. */
export function listTargetPaths(view: RulesetView, kind: TargetPathKind): TargetPathCatalog {
  return targetPathsOf(view).getTargetPathsAndLabels(view.rulesetData, kind);
}

/** A target path validated like a language server, among a catalog's paths: a valid one carries its definition. */
export function validateTargetPath(view: RulesetView, catalog: TargetPathCatalog, path: string) {
  return targetPathsOf(view).validateTargetPath(catalog, path);
}
