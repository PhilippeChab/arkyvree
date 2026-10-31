import type CharacterBase from "@/engine/core/character/CharacterBase.ts";
import type { LoadedCharacter } from "@/engine/core/character/CharacterDataLoader.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { formatChainingOperator, formatOperator, isValuelessOperator } from "@/shared/customization/operators.ts";
import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import type { Requirement } from "@/shared/relations.ts";

/** A character's validation: whether it's valid, and every issue it has. */
export interface ValidationResult {
  issues: RulesIssue[];
  valid: boolean;
}

/**
 * A character's validation, as every ruleset's reads its build: the ruleset's own issues (`findRulesetIssues`), its
 * unmet and invalid requirements, the modifiers it couldn't apply or applied past their gates, then where its rows come
 * from (`findSourceIssues`); and a requirement group's tree, which an issue shows.
 */
export function Validates<
  // Any ruleset's character, whatever its components (`object`: `CharacterBase` checks each is one of its data)
  B extends Constructor<CharacterBase<object, LoadedCharacter>>,
>(Base: B) {
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
          ? `Invalid requirement on ${this.labelEntity(entityName, requirement.entityType)}: ${warning}`
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
            ? `Unapplied modifier on ${modifier.target} from ${this.labelEntity(source.name, source.type)}`
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
            ? `Skipped modifier on ${modifier.target} from ${this.labelEntity(source.name, source.type)}: ${warning}`
            : `Skipped modifier: ${warning}`,
          entityName: source?.name,
          entityType: source?.type,
        });
      }
      for (const modifier of this.modifiersPastTheirGates) {
        const source = this.resolveModifierSourceName(modifier);
        issues.push({
          category: "modifiers",
          message: `Modifier on ${modifier.target}${source ? ` from ${this.labelEntity(source.name, source.type)}` : ""} applied while its requirement held, which no longer holds on the final sheet`,
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
        if (group.every((r) => this.rulesetData.isInventoryType(r.entityType))) continue;
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
          ? `Unmet prerequisite on ${this.labelEntity(entityName, owner.entityType)}`
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
        !!this.builtComponents && conditions.isConditionMet(req, this.builtComponents, this.groupContextsOf([req]));

      const formatNode = (node: RequirementNode<Requirement>, indent: string): string => {
        const req = node.requirement;
        if (req.chainingOperator) {
          const label = `(${formatChainingOperator(req.chainingOperator)})`;
          const childLines = node.children.map((child) => formatNode(child, indent + "  ")).join("\n");
          return `${indent}${label}\n${childLines}`;
        }
        // An operator's words, as the app shows them elsewhere (`formatOperator`); one checking its target alone, no value
        const op = req.operator ? formatOperator("requirement", req.operator) : "?";
        const condition = isValuelessOperator(req.operator ?? undefined)
          ? `${req.target} ${op}`
          : `${req.target} ${op} ${req.value}`;
        const marker = isLeafMet(req) ? "" : "  [UNMET]";
        return `${indent}${condition}${marker}`;
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
