import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import TemplateExpression from "@/engine/core/paths/TemplateExpression.ts";
import type { Components, TargetPathsTraverser, TraversePathResult } from "@/engine/core/types.ts";
import RequirementTree, { getParentLevel, type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import { extractTemplateExpression, isTemplateValue } from "@/shared/customization/templateExpression.ts";
import type { Requirement } from "@/shared/relations.ts";

type RequirementResults = {
  fulfilledRequirementGroups: Requirement[][];
  invalidRequirements: { requirement: Requirement; warning: string }[];
  requirements: Requirement[][];
  unmetRequirementGroups: Requirement[][];
};

export default class RequirementEvaluator {
  constructor(private readonly targetPaths: TargetPathsTraverser) {}

  private readonly results: RequirementResults = {
    requirements: [],
    invalidRequirements: [],
    unmetRequirementGroups: [],
    fulfilledRequirementGroups: [],
  };

  /**
   * Whether the character's `data` meets the requirement's operator against its typed value. The caller made sure the
   * data has the value's type: a number meets a number, a string a string.
   */
  private compareRequirement(requirement: Requirement, data: unknown, typedValue: number | string | boolean): boolean {
    const { operator, valueType } = requirement;
    // An operator that doesn't apply to the value's type: recorded, and unmet (or `fallback`).
    const invalid = (fallback = false) => {
      this.warn(requirement, `Invalid value type ${valueType} for operator ${operator}`);
      return fallback;
    };
    switch (operator) {
      case "equal":
        return data === typedValue;
      case "not_equal":
        return data !== typedValue;
      case "greater_than":
        return typeof typedValue === "number" && typeof data === "number" ? data > typedValue : invalid();
      case "less_than":
        return typeof typedValue === "number" && typeof data === "number" ? data < typedValue : invalid();
      case "greater_than_or_equal":
        return typeof typedValue === "number" && typeof data === "number" ? data >= typedValue : invalid();
      case "less_than_or_equal":
        return typeof typedValue === "number" && typeof data === "number" ? data <= typedValue : invalid();
      case "contains":
        if (typeof typedValue === "string" && typeof data === "string") return data.includes(typedValue);
        if (Array.isArray(data)) return data.includes(typedValue);
        return invalid();
      case "not_contains":
        if (typeof typedValue === "string" && typeof data === "string") return !data.includes(typedValue);
        if (Array.isArray(data)) return !data.includes(typedValue);
        return invalid();
      case "starts_with":
        return typeof typedValue === "string" && typeof data === "string" ? data.startsWith(typedValue) : invalid();
      case "ends_with":
        return typeof typedValue === "string" && typeof data === "string" ? data.endsWith(typedValue) : invalid();
      case "matches_regex":
      case "not_matches_regex": {
        if (typeof typedValue !== "string" || typeof data !== "string") return invalid();
        try {
          const matches = new RegExp(typedValue).test(data);
          return operator === "matches_regex" ? matches : !matches;
        } catch {
          return false;
        }
      }
      case "is_empty":
        if (typeof typedValue === "string") return data === "";
        if (Array.isArray(data)) return data.length === 0;
        return invalid(data == null);
      case "not_empty":
        if (typeof typedValue === "string") return data !== "";
        if (Array.isArray(data)) return data.length > 0;
        return invalid(data != null);
      default:
        this.warn(requirement, `Invalid operator ${operator}`);
        return false;
    }
  }

  /** A tree's node: a group by its operator over its children, a condition by whether it was met (`fulfilled`). */
  private evaluateNode(node: RequirementNode<Requirement>, fulfilled: ReadonlyMap<Requirement, boolean>): boolean {
    // If this is a chaining operator node
    if (node.requirement.chainingOperator) {
      if (node.children.length === 0) {
        // Chaining node with no children is considered unfulfilled
        return false;
      }

      // Apply the chaining operator to children
      switch (node.requirement.chainingOperator) {
        case "and":
          return node.children.every((child) => this.evaluateNode(child, fulfilled));
        case "or":
          return node.children.some((child) => this.evaluateNode(child, fulfilled));
        default:
          return false;
      }
    } else {
      // A condition node, which the tree gives no children
      return fulfilled.get(node.requirement) ?? false;
    }
  }

  private evaluateRequirement(requirement: Requirement, result: TraversePathResult, components: Components): boolean {
    const { valueType } = requirement;
    const { data } = result;

    if (!LiteralValue.hasType(data, valueType)) {
      this.warn(requirement, `Value type mismatch: expected ${valueType}, got ${typeof data}`);
      return false;
    }

    // Resolve the value side — template references first, then literal coercion.
    const typedValue = this.resolveRequirementValue(requirement, components);
    if (typedValue === null) return false;

    if (!LiteralValue.hasType(data, typeof typedValue)) {
      this.warn(requirement, `Value type mismatch: expected ${typeof data}, got ${typeof typedValue}`);
      return false;
    }
    return this.compareRequirement(requirement, data, typedValue);
  }

  private evaluateRequirementsGroup(requirements: Requirement[], components: Components, sourceId: string | undefined) {
    // The rows the tree holds: every group, and each condition that could be evaluated, with whether it was met
    const evaluated: Requirement[] = [];
    const fulfilled = new Map<Requirement, boolean>();

    for (const requirement of requirements) {
      if (requirement.chainingOperator !== null) {
        evaluated.push(requirement);
      } else if (requirement.target) {
        const results = this.targetPaths.traversePathInit(requirement.target, components, { sourceId });
        const validResults: TraversePathResult[] = [];

        for (const result of results) {
          if (result.error) {
            this.results.invalidRequirements.push({
              warning: result.error,
              requirement,
            });
          } else {
            validResults.push(result);
          }
        }

        // A path that names nothing gave errors: the requirement is invalid, not unmet. One that resolves is met
        // when any of what it reaches satisfies it (a wildcard reaches several), so unmet when it reaches nothing
        if (validResults.length > 0 || results.length === 0) {
          evaluated.push(requirement);
          fulfilled.set(
            requirement,
            validResults.some((result) => this.evaluateRequirement(requirement, result, components)),
          );
        }
      }
    }

    const tree = RequirementTree.fromRows(evaluated);
    // A row under a condition, which groups nothing, is left out
    for (const requirement of tree.detached) {
      this.results.invalidRequirements.push({
        warning: `Condition node at level ${getParentLevel(requirement.level)} cannot have children. Child level ${requirement.level} discarded.`,
        requirement,
      });
    }

    // The top-level rows are AND'd: the group is met when each of them is
    const isGroupFulfilled = tree.roots.every((node) => this.evaluateNode(node, fulfilled));

    if (isGroupFulfilled) this.results.fulfilledRequirementGroups.push(requirements);
    else this.results.unmetRequirementGroups.push(requirements);
  }

  /**
   * The requirement's value, typed: a template reference resolved against the components, or the literal coerced to its
   * value type. Null when it can't be (each reason recorded).
   */
  private resolveRequirementValue(requirement: Requirement, components: Components): number | string | boolean | null {
    const { value, valueType } = requirement;
    if (typeof value === "string" && isTemplateValue(value)) {
      const expression = extractTemplateExpression(value);
      if (!expression) {
        this.warn(requirement, `Invalid template expression: ${value}`);
        return null;
      }
      const resolved = TemplateExpression.evaluate(expression, components, this.targetPaths, (warning) =>
        this.warn(requirement, warning),
      );
      if (resolved === null) return null;
      // NaN / ±Infinity passes `typeof === "number"` and silently makes
      // every comparison false, marking the requirement unmet with no
      // diagnostic. Mirror the modifier-side guard.
      if (typeof resolved === "number" && !Number.isFinite(resolved)) {
        this.warn(requirement, `Template resolved to a non-finite number (${resolved})`);
        return null;
      }
      return resolved;
    }
    // A condition saved without a value (an emptiness check needs none) compares with the empty literal
    const literal = LiteralValue.parse(value ?? "", valueType);
    if (literal === undefined) {
      this.warn(requirement, `Invalid ${valueType} value: ${JSON.stringify(value)}`);
      return null;
    }
    return literal;
  }

  /** Records a requirement the engine couldn't evaluate, with why. */
  private warn(requirement: Requirement, warning: string) {
    this.results.invalidRequirements.push({ warning, requirement });
  }

  /** Evaluates the groups, each with the item it's of (`itemOf`), which a weapon's own paths (`weapon.wielded`) read. */
  evaluateRequirements(
    components: Components,
    requirements: Requirement[][],
    itemOf: (group: Requirement[]) => string | undefined = () => undefined,
  ) {
    for (const group of requirements) this.evaluateRequirementsGroup(group, components, itemOf(group));
  }

  getRequirements() {
    return this.results;
  }

  /**
   * Whether a condition (a requirement on a path, not a chain of them) is met: by any of what its path reaches, the item
   * it's of (`sourceId`) its weapon's own paths.
   */
  isConditionMet(requirement: Requirement, components: Components, sourceId?: string): boolean {
    if (!requirement.target) return false;
    return this.targetPaths
      .traversePathInit(requirement.target, components, { sourceId })
      .some((result) => !result.error && this.evaluateRequirement(requirement, result, components));
  }
}
