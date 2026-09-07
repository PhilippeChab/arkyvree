import type { Holder, Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/types.ts";
import type { Requirement } from "@/shared/relations.ts";
import {
  evaluateTemplateExpression,
  extractTemplateExpression,
  isTemplateValue,
} from "./templateExpression.ts";

type Node = {
  requirement: Requirement;
  fulfilled: boolean | null;
  children: Node[];
};

export type DetailedCharacterComprehensiveRequirements = {
  requirements: Requirement[][];
  invalidRequirements: { warning: string; requirement: Requirement }[];
  unmetRequirementGroups: Requirement[][];
  fulfilledRequirementGroups: Requirement[][];
};

export default class DetailedCharacterRequirements {
  private readonly detailedCharacterRequirements: DetailedCharacterComprehensiveRequirements = {
    requirements: [],
    invalidRequirements: [],
    unmetRequirementGroups: [],
    fulfilledRequirementGroups: [],
  };

  constructor(
    private readonly targetPaths: TargetPathsTraverser,
  ) {}

  evaluateRequirements(
    holders: Holders,
    requirements: Requirement[][],
  ) {
    for (const group of requirements) {
      this.evaluateRequirementsGroup(group, holders);
    }
  }

  private evaluateRequirementsGroup(
    requirements: Requirement[],
    holders: Holders,
  ) {
    const nodes: Node[] = [];

    for (const requirement of requirements) {
      if (requirement.chainingOperator !== null) {
        nodes.push({
          requirement,
          fulfilled: null,
          children: [],
        });
      } else if (requirement.target) {
        const results = this.targetPaths.traversePathInit(requirement.target, holders);
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

        if (validResults.length > 0) {
          // Wildcard paths expand to multiple results — use OR semantics
          // (requirement is met if ANY expanded path satisfies it)
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

  private evaluateRequirement(
    requirement: Requirement,
    result: TraversePathResult,
    holders: Holders,
  ): boolean {
    const { operator, value, valueType } = requirement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = result as { holder: Holder; data: any; object: any; key: string };

    // deno-lint-ignore valid-typeof
    if (typeof data !== valueType) {
      this.detailedCharacterRequirements.invalidRequirements.push({
        warning: `Value type mismatch: expected ${valueType}, got ${typeof data}`,
        requirement,
      });
      return false;
    }

    // Resolve the value side — template references first, then literal coercion.
    let typedValue: number | string | boolean;
    if (typeof value === "string" && isTemplateValue(value)) {
      const expression = extractTemplateExpression(value);
      if (!expression) {
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid template expression: ${value}`,
          requirement,
        });
        return false;
      }
      const resolved = evaluateTemplateExpression(
        expression,
        holders,
        this.targetPaths,
        (warning) => {
          this.detailedCharacterRequirements.invalidRequirements.push({
            warning,
            requirement,
          });
        },
      );
      if (resolved === null) return false;
      // NaN / ±Infinity passes `typeof === "number"` and silently makes
      // every comparison false, marking the requirement unmet with no
      // diagnostic. Mirror the modifier-side guard.
      if (typeof resolved === "number" && !Number.isFinite(resolved)) {
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Template resolved to a non-finite number (${resolved})`,
          requirement,
        });
        return false;
      }
      typedValue = resolved;
    } else {
      switch (valueType) {
        case "number":
          typedValue = Number(value);
          break;
        case "string":
          typedValue = String(value);
          break;
        case "boolean":
          typedValue = Boolean(value);
          break;
        default:
          this.detailedCharacterRequirements.invalidRequirements.push({
            warning: `Unsupported value type: ${valueType}`,
            requirement,
          });
          return false;
      }
    }

    if (typeof data !== typeof typedValue) {
      this.detailedCharacterRequirements.invalidRequirements.push({
        warning: `Value type mismatch: expected ${typeof data}, got ${typeof typedValue}`,
        requirement,
      });
      return false;
    }

    // Evaluate the requirement based on the operator
    switch (operator) {
      case "equal":
        return data === typedValue;
      case "not_equal":
        return data !== typedValue;
      case "greater_than":
        if (typeof typedValue === "number") {
          return data > typedValue;
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "less_than":
        if (typeof typedValue === "number") {
          return data < typedValue;
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "greater_than_or_equal":
        if (typeof typedValue === "number") {
          return data >= typedValue;
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "less_than_or_equal":
        if (typeof typedValue === "number") {
          return data <= typedValue;
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "contains":
        if (typeof typedValue === "string") {
          return data.includes(typedValue);
        }
        if (Array.isArray(data)) {
          return data.includes(typedValue);
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "not_contains":
        if (typeof typedValue === "string") {
          return !data.includes(typedValue);
        }
        if (Array.isArray(data)) {
          return !data.includes(typedValue);
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "starts_with":
        if (typeof typedValue === "string") {
          return data.startsWith(typedValue);
        }
        return false;
      case "ends_with":
        if (typeof typedValue === "string") {
          return data.endsWith(typedValue);
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "matches_regex":
        if (typeof typedValue === "string") {
          try {
            const regex = new RegExp(typedValue);
            return regex.test(data);
          } catch {
            return false;
          }
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "not_matches_regex":
        if (typeof typedValue === "string") {
          try {
            const regex = new RegExp(typedValue);
            return !regex.test(data);
          } catch {
            return false;
          }
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return false;
      case "is_empty":
        if (typeof typedValue === "string") {
          return data === "";
        }
        if (Array.isArray(data)) {
          return data.length === 0;
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return data == null;
      case "not_empty":
        if (typeof typedValue === "string") {
          return data !== "";
        }
        if (Array.isArray(data)) {
          return data.length > 0;
        }
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid value type ${valueType} for operator ${operator}`,
          requirement,
        });
        return data != null;
      default:
        this.detailedCharacterRequirements.invalidRequirements.push({
          warning: `Invalid operator ${operator}`,
          requirement,
        });
        return false;
    }
  }

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
              warning:
                `Condition node at level ${parentNode.requirement.level} cannot have children. Child level ${level} discarded.`,
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

  private evaluateTree(nodes: Node[]): boolean {
    if (nodes.length === 0) return true;

    // Evaluate each root node
    return nodes.every((node) => this.evaluateNode(node));
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

  getRequirements() {
    return this.detailedCharacterRequirements;
  }
}
