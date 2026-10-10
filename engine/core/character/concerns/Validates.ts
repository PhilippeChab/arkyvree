import type { default as CharacterBase, LoadedCharacter } from "@/engine/core/character/CharacterBase.ts";
import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { Constructor } from "@/lib/mixins.ts";
import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import type { Requirement } from "@/shared/relations.ts";

/** A character's validation: whether it's valid, and every issue it has. */
export type ValidationResult = {
  issues: RulesIssue[];
  valid: boolean;
};

/** Each comparison's symbol, as a requirement's tree prints it. */
const OPERATOR_SYMBOLS: Record<string, string> = {
  equal: "=",
  not_equal: "!=",
  greater_than: ">",
  less_than: "<",
  greater_than_or_equal: ">=",
  less_than_or_equal: "<=",
  contains: "contains",
  not_contains: "not contains",
  starts_with: "starts with",
  ends_with: "ends with",
  is_empty: "is empty",
  not_empty: "is not empty",
};

/**
 * A character's validation, as every ruleset's reads its build: the ruleset's own issues (`findRulesetIssues`), its
 * unmet and invalid requirements, the modifiers it couldn't apply or applied past their gates, then where its rows come
 * from (`findSourceIssues`); and a requirement group's tree, which an issue shows.
 */
export function Validates<B extends Constructor<CharacterBase<Components, LoadedCharacter>>>(Base: B) {
  abstract class Validating extends Base {
    /** The issue of a requirement the build couldn't evaluate, on the entity it's of. */
    private invalidRequirementIssue({
      warning,
      requirement,
    }: {
      requirement: Requirement;
      warning: string;
    }): RulesIssue {
      const entityName = this.resolveEntityName(requirement.entityId, requirement.entityType);
      return {
        category: "requirements",
        message: entityName
          ? `Invalid requirement on ${entityName} (${requirement.entityType}): ${warning}`
          : `Invalid requirement: ${warning}`,
        entityName,
        entityType: requirement.entityType,
      };
    }

    /** The modifiers the build couldn't apply, skipped, or applied past their gates, each on the entity it's from. */
    private modifierIssues(unmetRequirementGroups: Requirement[][]): RulesIssue[] {
      const issues: RulesIssue[] = [];
      const { skippedModifiers, unappliedModifiers } = this.modifierEvaluator.getModifiers();
      for (const modifier of unappliedModifiers) {
        const isConditional = unmetRequirementGroups.some((group) =>
          group.every((r) => r.entityType === "modifiers" && r.entityId === modifier.id),
        );
        if (isConditional) continue;
        const source = this.resolveModifierSourceName(modifier);
        issues.push({
          category: "modifiers",
          message: source
            ? `Unapplied modifier on ${modifier.target} from ${source.name} (${source.type})`
            : `Unapplied modifier on ${modifier.target} (blocked by unmet requirements)`,
          entityName: source?.name,
          entityType: source?.type,
        });
      }
      for (const { warning, modifier } of skippedModifiers) {
        const source = this.resolveModifierSourceName(modifier);
        issues.push({
          category: "modifiers",
          message: source
            ? `Skipped modifier on ${modifier.target} from ${source.name} (${source.type}): ${warning}`
            : `Skipped modifier: ${warning}`,
          entityName: source?.name,
          entityType: source?.type,
        });
      }
      for (const modifier of this.modifiersPastTheirGates) {
        const source = this.resolveModifierSourceName(modifier);
        issues.push({
          category: "modifiers",
          message: `Modifier on ${modifier.target}${source ? ` from ${source.name} (${source.type})` : ""} applied while its requirement held, which no longer holds on the final sheet`,
          entityName: source?.name,
          entityType: source?.type,
        });
      }
      return issues;
    }

    /** The character's unmet and invalid requirements: a modifier's or an item's own gates aside. */
    private requirementIssues(): RulesIssue[] {
      const issues: RulesIssue[] = [];
      const { unmetRequirementGroups, invalidRequirements } = this.requirementEvaluator.getRequirements();
      for (const group of unmetRequirementGroups) {
        if (group.every((r) => r.entityType === "modifiers")) continue;
        if (group.every((r) => r.entityType === "items")) continue;
        issues.push(this.unmetRequirementIssue(group, group.find((r) => r.entityType !== "modifiers") ?? group[0]));
      }
      for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));
      return issues;
    }

    /** An unmet requirement group's issue: on the entity of `owner`, one of its requirements, or naming its targets. */
    private unmetRequirementIssue(group: Requirement[], owner: Requirement): RulesIssue {
      const entityName = this.resolveEntityName(owner.entityId, owner.entityType);
      const targets = group.filter((r) => r.target).map((r) => r.target);
      return {
        category: "requirements",
        message: entityName
          ? `Unmet prerequisite on ${entityName} (${owner.entityType})`
          : `Unmet prerequisite: ${targets.join(", ") || "unknown"}`,
        entityName,
        entityType: owner.entityType,
        requirementTree: this.formatRequirements(group),
      };
    }

    /** A requirement group's tree, each condition marked when the character fails it. */
    formatRequirements(requirements: Requirement[]): string {
      // A row under a condition, which groups nothing, isn't printed
      const { roots } = RequirementTree.fromRows(requirements);

      // Each condition evaluated as the requirements are, templates and every operator included
      const conditions = new RequirementEvaluator(this.targetPaths);
      const isLeafMet = (req: Requirement) =>
        !!this.builtComponents && conditions.isConditionMet(req, this.builtComponents, this.itemOf([req]));

      const formatNode = (node: RequirementNode<Requirement>, indent: string): string => {
        const req = node.requirement;
        if (req.chainingOperator) {
          const label = `(${req.chainingOperator.toUpperCase()})`;
          const childLines = node.children.map((child) => formatNode(child, indent + "  ")).join("\n");
          return `${indent}${label}\n${childLines}`;
        }
        const op = OPERATOR_SYMBOLS[req.operator ?? ""] ?? req.operator ?? "?";
        const isMet = isLeafMet(req);
        const marker = isMet ? "" : "  [UNMET]";
        return `${indent}${req.target} ${op} ${req.value}${marker}`;
      };

      return roots.map((root) => formatNode(root, "")).join("\n");
    }

    /** The issues of requirement groups the character fails, evaluated on its built sheet. */
    getUnmetRequirementIssues(requirementGroups: Requirement[][]): RulesIssue[] {
      const { unmetRequirementGroups, invalidRequirements } = this.evaluateGroups(requirementGroups);
      const issues: RulesIssue[] = [];

      for (const group of unmetRequirementGroups) issues.push(this.unmetRequirementIssue(group, group[0]));
      for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));
      return issues;
    }

    /**
     * The character's validation: the ruleset's own issues, its requirements', its modifiers', then where its rows come
     * from; valid with none.
     */
    validate(): ValidationResult {
      const { unmetRequirementGroups } = this.requirementEvaluator.getRequirements();
      const issues = [
        ...this.findRulesetIssues(),
        ...this.requirementIssues(),
        ...this.modifierIssues(unmetRequirementGroups),
        ...this.findSourceIssues(),
      ];
      return { valid: issues.length === 0, issues };
    }
  }

  return Validating;
}
