import { buildSourceChain } from "@/engine/core/cow/index.ts";
import { checkTargetValue, listTargetPaths, validateTargetPath } from "@/engine/index.ts";
import { RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";

/**
 * The ruleset's target paths of a kind, with their segments' labels, as the engine lists them: cached for the ruleset
 * and those it depends on. Of an entity type (`entityType`), the paths it takes.
 */
export async function getTargetPathsWithLabels(
  rulesetId: string,
  kind: TargetPathKind,
  entityType?: string,
): Promise<TargetPathCatalog> {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  // Compose inside the registered cache fill: composing beforehand can carry
  // a stale view across invalidation and later cache paths derived from it.
  const result = await RulesetCache.getTargetPaths(
    rulesetId,
    kind,
    () => withRulesetScope(db, rulesetId, async (scope) => listTargetPaths(scope, kind)),
    buildSourceChain(ruleset),
  );
  if (!entityType) return result;
  return {
    paths: result.paths.filter((p) => !p.allowedEntityTypes || p.allowedEntityTypes.includes(entityType)),
    segmentLabels: result.segmentLabels,
  };
}

/**
 * The value type of the path a modifier or requirement targets, its operator and value checked against it by the
 * engine: refused as invalid with what's wrong.
 */
export async function resolvePathValueType(
  rulesetId: string,
  target: string,
  kind: "modifier" | "requirement",
  operator: string | undefined,
  value: string | undefined,
  sourceType?: string,
): Promise<string> {
  const paths = await getTargetPathsWithLabels(rulesetId, kind);
  const templatePaths = await getTargetPathsWithLabels(rulesetId, "template");
  return await withRulesetScope(db, rulesetId, async (scope) =>
    checkTargetValue(scope, { paths, templatePaths }, { kind, operator, sourceType, target, value }),
  );
}

/**
 * Validate a target path like a language server, among the paths an entity type takes (`entityType`, every path
 * without one). A valid path's result carries its definition: what it takes.
 */
export async function validatePath(
  rulesetId: string,
  path: string,
  kind: TargetPathKind = "modifier",
  entityType?: string,
) {
  const catalog = await getTargetPathsWithLabels(rulesetId, kind, entityType);
  return await withRulesetScope(db, rulesetId, async (scope) => validateTargetPath(scope, catalog, path));
}
