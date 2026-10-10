/** What the paths a modifier or a requirement targets take: a path among a ruleset's, and the operator and value set on it. */

import RulesError from "@/engine/core/RulesError.ts";
import type {
  PathCompletion,
  PathError,
  PathValidationResult,
  TargetPath,
  TargetPathCatalog,
} from "@/shared/customization/target.ts";
import {
  extractTemplateExpression,
  findTemplateError,
  isTemplateValue,
} from "@/shared/customization/templateExpression.ts";

import LiteralValue from "./LiteralValue.ts";

/** A modifier's or a requirement's target, operator and value, which its path's check reads. */
export interface TargetCheck {
  kind: "modifier" | "requirement";
  operator?: string;
  sourceType?: string;
  target: string;
  value?: string;
}

/**
 * The checks of the paths of a catalog (`catalog`, of the ruleset's `categories`): a path validated like a language
 * server, and a modifier's or a requirement's operator and value checked against the path it targets.
 */
export default class PathChecks {
  constructor(
    private readonly categories: string[],
    private readonly catalog: TargetPathCatalog,
  ) {}

  /** Why a modifier's or requirement's operator and value don't suit the path, or null when they do. */
  private static valueMismatch(
    pathDef: TargetPath,
    operator: string | undefined,
    value: string | undefined,
  ): string | null {
    const { path, valueType } = pathDef;
    if (operator !== undefined && !pathDef.operators.includes(operator))
      return `The operator ${operator} isn't offered on ${path}: ${pathDef.operators.join(", ")}`;

    if (value === undefined) return null;
    if (isTemplateValue(value)) return pathDef.literalOnly ? `${path} takes a number, not a template` : null;
    const literal = LiteralValue.parse(value, valueType);
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
   * What's wrong with a template value for a value of `valueType`, or null: checked as the sheet will evaluate it, against
   * the paths a template of the ruleset reads (`templatePaths`, the "template" listing).
   */
  static findTemplateValueError(templatePaths: TargetPathCatalog, value: string, valueType: string) {
    const expression = extractTemplateExpression(value);
    if (expression === null) return `Invalid template ${JSON.stringify(value)}`;
    return findTemplateError(
      expression,
      new Map(templatePaths.paths.map((path) => [path.path, path.valueType])),
      valueType,
    );
  }

  /**
   * The value type of the path a modifier or requirement targets (`target`, among `catalog`'s), its operator and value
   * checked against it: an operator the path offers, and a template the sheet resolves (against the paths a template
   * reads, `templatePaths`) or a literal of that type (a number, `true` or `false`), as the path allows. A modifier's
   * `sourceType` must be one the path takes modifiers from (a level's advancement, a pool's slots). Refused as invalid,
   * with what's wrong.
   */
  checkValue(templatePaths: TargetPathCatalog, check: TargetCheck): string {
    const { kind, operator, sourceType, target, value } = check;
    const pathDef = this.catalog.paths.find((p) => p.path === target);
    if (!pathDef) {
      const { errors } = this.validate(target);
      throw new RulesError("invalid", `Invalid ${kind} path: ${errors[0]?.message ?? target}`);
    }
    const allowed = kind === "modifier" ? pathDef.allowedEntityTypes : undefined;
    if (allowed && sourceType && !allowed.includes(sourceType))
      throw new RulesError("invalid", `${target} takes modifiers from ${allowed.join(", ")} only`);

    const mismatch = PathChecks.valueMismatch(pathDef, operator, value);
    if (mismatch) throw new RulesError("invalid", mismatch);
    if (value !== undefined && isTemplateValue(value)) {
      const templateError = PathChecks.findTemplateValueError(templatePaths, value, pathDef.valueType);
      if (templateError) throw new RulesError("invalid", templateError);
    }
    return pathDef.valueType;
  }

  /**
   * Validates a target path like a language server, among the paths of a catalog (`allPaths`, of the categories
   * `validCategories`). A valid path's result carries its definition: what it takes.
   */
  validate(path: string): PathValidationResult {
    const validCategories = this.categories;
    const allPaths = this.catalog.paths;
    const pathMap = new Map(allPaths.map((p) => [p.path, p]));

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
        (cat) =>
          cat.toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes(cat.toLowerCase()),
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
}
