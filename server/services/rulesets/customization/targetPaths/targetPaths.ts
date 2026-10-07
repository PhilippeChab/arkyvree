import { buildSourceChain, RulesetCache, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { parseLiteralValue } from "@/server/rulesets/engine/paths/literalValue.ts";
import { isTemplateValue } from "@/server/rulesets/engine/paths/templateExpression.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type {
  PathCompletion,
  PathError,
  PathValidationResult,
  TargetPath,
  TargetPathKind,
} from "@/shared/customization/target.ts";

/** Why a modifier's or requirement's operator and value don't suit the path, or null when they do. */
function valueMismatch(pathDef: TargetPath, operator: string | undefined, value: string | undefined): string | null {
  const { path, valueType } = pathDef;
  if (operator !== undefined && !pathDef.operators.includes(operator))
    return `The operator ${operator} isn't offered on ${path}: ${pathDef.operators.join(", ")}`;

  if (value === undefined) return null;
  if (isTemplateValue(value)) return pathDef.literalOnly ? `${path} takes a number, not a template` : null;
  const literal = parseLiteralValue(value, valueType);
  if (literal === undefined) return `Invalid ${valueType} value for ${path}: ${JSON.stringify(value)}`;
  if (operator === "set" && pathDef.setValues) {
    if (pathDef.setValues.some((choice) => choice.value === value)) return null;
    return `A set on ${path} takes ${pathDef.setValues.map((choice) => `${choice.value} (${choice.label})`).join(", ")}`;
  }
  if (pathDef.minValue !== undefined && typeof literal === "number" && literal < pathDef.minValue)
    return `${path} takes ${pathDef.minValue} or more`;

  return null;
}

/**
 * Get all target paths with segment labels in a single fetch.
 * Entity data is fetched once and used to build both.
 */
export async function getTargetPathsWithLabels(
  rulesetId: string,
  kind: TargetPathKind,
  entityType?: string,
): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
  const ruleset = await Rulesets.findOne(db, { id: rulesetId });
  if (!ruleset) throw new NotFoundError("Ruleset not found");
  // Compose inside the registered cache fill: composing beforehand can carry
  // a stale view across invalidation and later cache paths derived from it.
  const result = await RulesetCache.getTargetPaths(
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
 * The value type of the path a modifier or requirement targets, its operator and value checked against it: an operator
 * the path offers, and a template the sheet resolves or a literal of that type (a number, `true` or `false`), as the
 * path allows. A modifier's `sourceType` must be one the path takes modifiers from (a level's advancement, a pool's
 * slots). A BadRequestError says what's wrong.
 */
export async function resolvePathValueType(
  rulesetId: string,
  target: string,
  kind: "modifier" | "requirement",
  operator: string | undefined,
  value: string | undefined,
  sourceType?: string,
): Promise<string> {
  const { paths } = await getTargetPathsWithLabels(rulesetId, kind);
  const pathDef = paths.find((p) => p.path === target);
  if (!pathDef) {
    const { errors } = await validatePath(rulesetId, target, kind);
    throw new BadRequestError(`Invalid ${kind} path: ${errors[0]?.message ?? target}`);
  }
  const allowed = kind === "modifier" ? pathDef.allowedEntityTypes : undefined;
  if (allowed && sourceType && !allowed.includes(sourceType))
    throw new BadRequestError(`${target} takes modifiers from ${allowed.join(", ")} only`);

  const mismatch = valueMismatch(pathDef, operator, value);
  if (mismatch) throw new BadRequestError(mismatch);
  return pathDef.valueType;
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
): Promise<PathValidationResult> {
  const { paths: allPaths } = await getTargetPathsWithLabels(rulesetId, kind, entityType);
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
  if (exactMatch) return { isValid: true, errors: [], suggestions: [], completions: [], target: exactMatch };

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
