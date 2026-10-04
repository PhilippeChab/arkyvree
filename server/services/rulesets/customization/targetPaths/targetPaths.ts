import { getOrFetchTargetPathsAndLabels } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { parseLiteralValue } from "@/server/rulesets/universal/literalValue.ts";
import { isTemplateValue } from "@/server/rulesets/universal/templateExpression.ts";
import { buildSourceChain, withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { PathCompletion, PathError, PathValidationResult, TargetPath } from "@/shared/customization/target.ts";

/**
 * Get all target paths with segment labels in a single fetch.
 * Entity data is fetched once and used to build both.
 */
export async function getTargetPathsWithLabels(
  rulesetId: string,
  kind: "modifier" | "requirement",
  entityType?: string,
): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  // Compose inside the registered cache fill: composing beforehand can carry
  // a stale view across invalidation and later cache paths derived from it.
  const result = await getOrFetchTargetPathsAndLabels(
    rulesetId,
    kind,
    () =>
      withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
        const generator = RulesetFactory.fromBaseRules(ruleset.baseRules).createTargetPaths();
        return generator.getTargetPathsAndLabels(rulesetData, kind);
      }),
    buildSourceChain(ruleset),
  );
  if (!entityType) return result;
  return {
    paths: result.paths.filter((p) => !p.allowedEntityTypes || p.allowedEntityTypes.includes(entityType)),
    segmentLabels: result.segmentLabels,
  };
}

/**
 * Validate a target path like a language server
 */
export async function validatePath(
  rulesetId: string,
  path: string,
  kind: "modifier" | "requirement" = "modifier",
): Promise<PathValidationResult> {
  const { paths: allPaths } = await getTargetPathsWithLabels(rulesetId, kind);
  const pathMap = new Map(allPaths.map((p) => [p.path, p]));
  const generator = await RulesetFactory.fromRulesetId(rulesetId).then((m) => m.createTargetPaths());
  const validCategories = generator.getCategories();

  const errors: PathError[] = [];
  const suggestions: string[] = [];
  const completions: PathCompletion[] = [];

  const segments = path.split(".");

  const category = segments[0];

  if (!validCategories.includes(category)) {
    errors.push({
      message: `Unknown category '${category}'. Valid categories: ${validCategories.join(", ")}`,
      position: { start: 0, end: category.length },
      severity: "error",
      code: "INVALID_CATEGORY",
    });

    const similarCategories = validCategories.filter(
      (cat) => cat.toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes(cat.toLowerCase()),
    );
    suggestions.push(...similarCategories);
  }

  const exactMatch = pathMap.get(path);
  if (exactMatch) {
    return { isValid: true, errors: [], suggestions: [], completions: [] };
  }

  const partialMatches = allPaths.filter((p) => p.path.startsWith(path));
  if (partialMatches.length > 0) {
    errors.push({
      message: `Incomplete path. Did you mean: ${partialMatches
        .slice(0, 3)
        .map((p) => p.path)
        .join(", ")}?`,
      position: { start: 0, end: path.length },
      severity: "warning",
      code: "INCOMPLETE_PATH",
    });
    suggestions.push(...partialMatches.slice(0, 5).map((p) => p.path));
  } else {
    errors.push({
      message: `Invalid path '${path}'. No matching paths found.`,
      position: { start: 0, end: path.length },
      severity: "error",
      code: "INVALID_PATH",
    });
  }

  return { isValid: false, errors, suggestions, completions };
}

/**
 * The value type of the path a modifier or requirement targets, its value checked against it: a template the sheet
 * resolves, or a literal of that type (a number, `true` or `false`). A BadRequestError says what's wrong with either.
 */
export async function resolvePathValueType(
  rulesetId: string,
  target: string,
  kind: "modifier" | "requirement",
  value: string | undefined,
): Promise<string> {
  const { paths } = await getTargetPathsWithLabels(rulesetId, kind);
  const pathDef = paths.find((p) => p.path === target);
  if (!pathDef) {
    const { errors } = await validatePath(rulesetId, target, kind);
    throw new BadRequestError(`Invalid ${kind} path: ${errors[0]?.message ?? target}`);
  }
  const { valueType } = pathDef;
  if (value !== undefined && !isTemplateValue(value) && parseLiteralValue(value, valueType) === undefined) {
    throw new BadRequestError(`Invalid ${valueType} value for ${target}: ${JSON.stringify(value)}`);
  }
  return valueType;
}
