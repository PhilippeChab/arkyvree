import type { Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/types.ts";
import type { Requirement } from "@/shared/relations.ts";

import { parseLiteralValue } from "./literalValue.ts";
import { evaluateTemplateExpression, extractTemplateExpression, isTemplateValue } from "./templateExpression.ts";

type Node = {
  requirement: Requirement;
  fulfilled: boolean | null;
  children: Node[];
};

type DetailedCharacterComprehensiveRequirements = {
  requirements: Requirement[][];
  invalidRequirements: { warning: string; requirement: Requirement }[];
  unmetRequirementGroups: Requirement[][];
  fulfilledRequirementGroups: Requirement[][];
};

export default class DetailedCharacterRequirements {
  constructor(private readonly targetPaths: TargetPathsTraverser) {}

  private readonly detailedCharacterRequirements: DetailedCharacterComprehensiveRequirements = {
    requirements: [],
    invalidRequirements: [],
    unmetRequirementGroups: [],
    fulfilledRequirementGroups: [],
  };

  private buildTree(nodes: Node[]): Node[] {
    if (nodes.length === 0) return [];

    // Sort nodes by level to ensure proper hierarchy
    const sortedNodes = nodes.sort((a, b) => {
      const aLevel = parseFloat(a.requirement.level);
      const bLevel = parseFloat(b.requirement.level);
      return aLevel - bLevel;
    });

    const tree: Node[] = [];
    const nodeMap = new Map<string, Node>();

    // First pass: Create a map of all nodes by their level
    for (const node of sortedNodes) {
      nodeMap.set(node.requirement.level, node);
    }

    // Second pass: Build the hierarchy
    for (const node of sortedNodes) {
      const level = node.requirement.level;
      const levelParts = level.split(".");

      if (levelParts.length === 1) {
        // Root level node (e.g., "1", "2", "3")
        tree.push(node);
      } else {
        // Child node (e.g., "1.1", "1.2", "1.2.1")
        const parentLevel = levelParts.slice(0, -1).join(".");
        const parentNode = nodeMap.get(parentLevel);

        if (parentNode) {
          // Validate: only chaining operator nodes can have children
          if (!parentNode.requirement.chainingOperator) {
            this.detailedCharacterRequirements.invalidRequirements.push({
              warning: `Condition node at level ${parentNode.requirement.level} cannot have children. Child level ${level} discarded.`,
              requirement: node.requirement,
            });
            // Discard this node - don't add it anywhere
          } else {
            parentNode.children.push(node);
          }
        } else {
          // If parent doesn't exist, add to root level
          // This handles cases where the hierarchy might be incomplete
          tree.push(node);
        }
      }
    }

    return tree;
  }

  /**
   * The requirement's value, typed: a template reference resolved against the holders, or the literal coerced to its
   * value type. Null when it can't be (each reason recorded).
   */
  private resolveRequirementValue(requirement: Requirement, holders: Holders): number | string | boolean | null {
    const { value, valueType } = requirement;
    if (typeof value === "string" && isTemplateValue(value)) {
      const expression = extractTemplateExpression(value);
      if (!expression) {
        this.warn(requirement, `Invalid template expression: ${value}`);
        return null;
      }
      const resolved = evaluateTemplateExpression(expression, holders, this.targetPaths, (warning) =>
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
    const literal = parseLiteralValue(value ?? "", valueType);
    if (literal === undefined) {
      this.warn(requirement, `Invalid ${valueType} value: ${JSON.stringify(value)}`);
      return null;
    }
    return literal;
  }

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
        return typeof typedValue === "string" && typeof data === "string" ? data.startsWith(typedValue) : false;
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

  private evaluateNode(node: Node): boolean {
    // If this is a chaining operator node
    if (node.requirement.chainingOperator) {
      if (node.children.length === 0) {
        // Chaining node with no children is considered unfulfilled
        return false;
      }

      // Apply the chaining operator to children
      switch (node.requirement.chainingOperator) {
        case "and":
          return node.children.every((child) => this.evaluateNode(child));
        case "or":
          return node.children.some((child) => this.evaluateNode(child));
        default:
          return false;
      }
    } else {
      // This is a condition node, fulfilled should always be boolean (not null)
      // After validation, condition nodes should never have children
      const fulfilled = node.fulfilled!;
      return fulfilled;
    }
  }

  private evaluateRequirement(requirement: Requirement, result: TraversePathResult, holders: Holders): boolean {
    const { valueType } = requirement;
    const { data } = result;

    if (typeof data !== valueType) {
      this.warn(requirement, `Value type mismatch: expected ${valueType}, got ${typeof data}`);
      return false;
    }

    // Resolve the value side — template references first, then literal coercion.
    const typedValue = this.resolveRequirementValue(requirement, holders);
    if (typedValue === null) return false;

    if (typeof data !== typeof typedValue) {
      this.warn(requirement, `Value type mismatch: expected ${typeof data}, got ${typeof typedValue}`);
      return false;
    }
    return this.compareRequirement(requirement, data, typedValue);
  }

  private evaluateRequirementsGroup(requirements: Requirement[], holders: Holders, sourceId: string | undefined) {
    const nodes: Node[] = [];

    for (const requirement of requirements) {
      if (requirement.chainingOperator !== null) {
        nodes.push({
          requirement,
          fulfilled: null,
          children: [],
        });
      } else if (requirement.target) {
        const results = this.targetPaths.traversePathInit(requirement.target, holders, { sourceId });
        const validResults: TraversePathResult[] = [];

        for (const result of results) {
          if (result.error) {
            this.detailedCharacterRequirements.invalidRequirements.push({
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
          const fulfilled = validResults.some((result) => this.evaluateRequirement(requirement, result, holders));

          nodes.push({
            requirement,
            fulfilled,
            children: [],
          });
        }
      }
    }

    const tree = this.buildTree(nodes);

    // Process the tree to determine overall fulfillment
    const isGroupFulfilled = this.evaluateTree(tree);

    if (isGroupFulfilled) {
      this.detailedCharacterRequirements.fulfilledRequirementGroups.push(requirements);
    } else {
      this.detailedCharacterRequirements.unmetRequirementGroups.push(requirements);
    }
  }

  private evaluateTree(nodes: Node[]): boolean {
    if (nodes.length === 0) return true;

    return nodes.every((node) => this.evaluateNode(node));
  }

  /** Records a requirement the engine couldn't evaluate, with why. */
  private warn(requirement: Requirement, warning: string) {
    this.detailedCharacterRequirements.invalidRequirements.push({ warning, requirement });
  }

  getRequirements() {
    return this.detailedCharacterRequirements;
  }

  /**
   * Whether a condition (a requirement on a path, not a chain of them) is met: by any of what its path reaches, the item
   * it's of (`sourceId`) its weapon's own paths.
   */
  isConditionMet(requirement: Requirement, holders: Holders, sourceId?: string): boolean {
    if (!requirement.target) return false;
    return this.targetPaths
      .traversePathInit(requirement.target, holders, { sourceId })
      .some((result) => !result.error && this.evaluateRequirement(requirement, result, holders));
  }

  /** Evaluates the groups, each with the item it's of (`itemOf`), which a weapon's own paths (`weapon.wielded`) read. */
  evaluateRequirements(
    holders: Holders,
    requirements: Requirement[][],
    itemOf: (group: Requirement[]) => string | undefined = () => undefined,
  ) {
    for (const group of requirements) {
      this.evaluateRequirementsGroup(group, holders, itemOf(group));
    }
  }
}
