/** A ruleset's target paths, as the engine lists them from its view: kept in the cache with the view they come from. */

import { listTargetPaths } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";

import RulesetCache from "./RulesetCache.ts";
import { withRulesetScope } from "./scope.ts";

/** The catalogs a modifier's or a requirement's value is checked against: its kind's paths, and a template's. */
export async function readTargetPathCatalogs(rulesetId: string, kind: "modifier" | "requirement") {
  return {
    paths: await readTargetPaths(rulesetId, kind),
    templatePaths: await readTargetPaths(rulesetId, "template"),
  };
}

/**
 * The ruleset's target paths of a kind, with their segments' labels, as the engine lists them: cached for the ruleset
 * and those it depends on.
 */
export async function readTargetPaths(rulesetId: string, kind: TargetPathKind): Promise<TargetPathCatalog> {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  // Compose inside the registered cache fill: composing beforehand can carry
  // a stale view across invalidation and later cache paths derived from it.
  return await RulesetCache.getTargetPaths(ruleset, kind, () =>
    withRulesetScope(db, rulesetId, async (scope) => listTargetPaths(scope, kind)),
  );
}
