import type { Constructor } from "@/server/mixins.ts";
import { ALLOWED_ALL } from "@/server/rulesets/dnd3.5/aptitudes/AptitudesComponent.ts";
import type CharacterState from "@/server/rulesets/dnd3.5/character/CharacterState.ts";
import type { ValidationIssue, ValidationResult } from "@/server/rulesets/dnd3.5/character/CharacterState.ts";
import RequirementEvaluator from "@/server/rulesets/engine/requirements/RequirementEvaluator.ts";
import type {
  FeatWithPMR,
  InventoryEntry,
  KlassLevelWithPMR,
  PowerWithPMR,
  RequirementIssue,
} from "@/server/rulesets/engine/types.ts";
import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import type { Klass, Modifier, Requirement } from "@/shared/relations.ts";

/** An aptitude pool's (or one of its spell levels') slots. */
type AptitudeSlots = { allowed: number; spent: number; available: number };

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

/** A 3.5 character's validation: what its rules flag, and the names its issues give. */
export function Validates<B extends Constructor<CharacterState>>(Base: B) {
  abstract class Validating extends Base {
    private findIssues(): ValidationIssue[] {
      const issues: ValidationIssue[] = [];

      // Check aptitudes: each should have available === 0
      const slotIssue = (name: string, { allowed, spent, available }: AptitudeSlots) => {
        if (allowed === ALLOWED_ALL || available === 0) return;
        issues.push({
          category: "aptitudes",
          message:
            available > 0
              ? `${name}: ${available} unspent slot(s) (${spent}/${allowed})`
              : `${name}: overspent by ${Math.abs(available)} (${spent}/${allowed})`,
        });
      };
      const aptitudes = this.components.aptitudes.getAptitudes();
      for (const [key, aptitude] of Object.entries(aptitudes)) {
        if (this.components.aptitudes.isLeveledAptitude(key)) {
          const aptitudeObj = aptitude as Record<string, unknown>;
          for (let level = 0; level <= this.components.aptitudes.maxSpellLevel; level++) {
            const levelData = aptitudeObj[String(level)] as AptitudeSlots | undefined;
            if (levelData) slotIssue(`${aptitude.name} (level ${level})`, levelData);
          }
        } else {
          slotIssue(aptitude.name, aptitude);
        }
      }

      // Check unmet requirements (skip modifier/item requirements)
      const { unmetRequirementGroups, invalidRequirements } = this.requirementEvaluator.getRequirements();
      for (const group of unmetRequirementGroups) {
        if (group.every((r) => r.entityType === "modifiers")) continue;
        if (group.every((r) => r.entityType === "items")) continue;
        issues.push(this.unmetRequirementIssue(group, group.find((r) => r.entityType !== "modifiers") ?? group[0]));
      }
      for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));

      // Check modifier issues
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

      // Check referential integrity
      const sourceChain = (rulesetId: string, name: string, entityType: string) => {
        if (!this.validRulesetIds.has(rulesetId)) {
          issues.push({
            category: "integrity",
            message: `${entityType} "${name}" belongs to a ruleset not in this character's source chain`,
            entityName: name,
            entityType,
          });
        }
      };
      sourceChain(this.race.rulesetId, this.race.name, "races");
      for (const klass of this.klasses) sourceChain(klass.rulesetId, klass.name, "klasses");
      for (const skill of this.skills) sourceChain(skill.rulesetId, skill.name, "skills");
      for (const feat of this.feats) sourceChain(feat.rulesetId, feat.name, "feats");
      for (const power of this.powers) sourceChain(power.rulesetId, power.name, "powers");
      for (const inv of this.inventory) sourceChain(inv.item.rulesetId, inv.item.name, "items");

      return issues;
    }

    private getDiagnosticsIndex() {
      if (this.diagnosticsIndex) return this.diagnosticsIndex;
      const featsById = new Map<string, FeatWithPMR>();
      for (const f of this.feats) featsById.set(f.id, f);
      const powersById = new Map<string, PowerWithPMR>();
      for (const p of this.powers) powersById.set(p.id, p);
      const klassLevelsById = new Map<string, KlassLevelWithPMR>();
      for (const kl of this.klassLevels) klassLevelsById.set(kl.id, kl);
      const rulesetKlassesById = new Map<string, Klass>();
      for (const k of this.rulesetKlasses) rulesetKlassesById.set(k.id, k);
      const inventoryByItemId = new Map<string, InventoryEntry>();
      for (const inv of this.inventory) {
        inventoryByItemId.set(inv.item.id, inv);
        if (inv.item.sourceItemId) inventoryByItemId.set(inv.item.sourceItemId, inv);
      }

      // Flat modifier.id → owning entity index. Built once by iterating every
      // entity that owns modifiers so resolveModifierSourceName becomes O(1).
      const modifierOwner = new Map<string, { name: string; type: string }>();
      for (const feat of this.feats) {
        for (const m of feat.modifiers) modifierOwner.set(m.id, { name: feat.name, type: "feats" });
      }
      for (const inv of this.inventory) {
        for (const m of inv.item.modifiers) modifierOwner.set(m.id, { name: inv.item.name, type: "items" });
      }
      if (this.race?.modifiers) {
        for (const m of this.race.modifiers) modifierOwner.set(m.id, { name: this.race.name, type: "races" });
      }
      for (const kl of this.klassLevels) {
        const klass = rulesetKlassesById.get(kl.klassId);
        const label = klass ? `${klass.name} Level ${kl.level}` : `Level ${kl.level}`;
        for (const m of kl.modifiers) modifierOwner.set(m.id, { name: label, type: "klass_levels" });
      }
      for (const power of this.powers) {
        for (const m of power.modifiers) modifierOwner.set(m.id, { name: power.name, type: "powers" });
      }

      this.diagnosticsIndex = {
        featsById,
        powersById,
        klassLevelsById,
        rulesetKlassesById,
        inventoryByItemId,
        modifierOwner,
      };
      return this.diagnosticsIndex;
    }

    protected getSkillValidationIssues(): { budget: ValidationIssue[]; ranks: ValidationIssue[] } {
      const budget: ValidationIssue[] = [];
      const { available, spent, total } = this.components.skills.getSkillBudget();
      if (available > 0) {
        budget.push({ category: "skills", message: `${available} unspent skill point(s) (${spent}/${total})` });
      } else if (available < 0) {
        budget.push({
          category: "skills",
          message: `Overspent by ${Math.abs(available)} skill point(s) (${spent}/${total})`,
        });
      }
      const characterLevel = this.components.identity.getIdentity().meta.level;
      const ranks = this.components.skills.getValidationIssues(characterLevel);
      return { budget, ranks };
    }

    private invalidRequirementIssue({
      warning,
      requirement,
    }: {
      warning: string;
      requirement: Requirement;
    }): RequirementIssue {
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

    /** An unmet requirement group's issue: on the entity of `owner`, one of its requirements, or naming its targets. */
    private unmetRequirementIssue(group: Requirement[], owner: Requirement): RequirementIssue {
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

    getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[] {
      if (!this.builtComponents) return [];

      const tempRequirements = new RequirementEvaluator(this.targetPaths);
      const nonEmpty = requirementGroups.filter((group) => group.length > 0);
      if (nonEmpty.length === 0) return [];

      tempRequirements.evaluateRequirements(this.builtComponents, nonEmpty, this.itemOf);
      const { unmetRequirementGroups, invalidRequirements } = tempRequirements.getRequirements();
      const issues: RequirementIssue[] = [];

      for (const group of unmetRequirementGroups) issues.push(this.unmetRequirementIssue(group, group[0]));
      for (const invalid of invalidRequirements) issues.push(this.invalidRequirementIssue(invalid));
      return issues;
    }

    resolveEntityName(entityId: string, entityType: string): string | undefined {
      const idx = this.getDiagnosticsIndex();
      switch (entityType) {
        case "races":
          if (this.race?.id === entityId) return this.race.name;
          break;
        case "feats":
          return idx.featsById.get(entityId)?.name;
        case "powers":
          return idx.powersById.get(entityId)?.name;
        case "items":
          return idx.inventoryByItemId.get(entityId)?.item.name;
        case "klasses":
          return idx.rulesetKlassesById.get(entityId)?.name;
        case "modifiers": {
          const mod =
            this.modifiers.find((m) => m.id === entityId) ??
            this.components.spellcasting.getBonusKlassLevelModifiers().find((m) => m.id === entityId);
          if (mod) {
            return this.resolveEntityName(mod.sourceId, mod.sourceType);
          }
          break;
        }
        case "characters":
          if (this.character.id === entityId) return this.character.name;
          break;
        case "klass_levels": {
          const kl = idx.klassLevelsById.get(entityId);
          if (kl) {
            const klass = idx.rulesetKlassesById.get(kl.klassId);
            return klass ? `${klass.name} Level ${kl.level}` : `Level ${kl.level}`;
          }
          const attribution = this.components.spellcasting.getBonusKlassLevelAttribution().get(entityId);
          if (attribution) return attribution;
          const bonusKl = this.components.spellcasting.getBonusKlassLevels().find((k) => k.id === entityId);
          if (bonusKl) {
            const klass = idx.rulesetKlassesById.get(bonusKl.klassId);
            return klass ? `${klass.name} Level ${bonusKl.level} (bonus)` : `Level ${bonusKl.level} (bonus)`;
          }
          break;
        }
      }
      return undefined;
    }

    resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined {
      const name = this.resolveEntityName(modifier.sourceId, modifier.sourceType);
      if (name) return { name, type: modifier.sourceType };
      return this.getDiagnosticsIndex().modifierOwner.get(modifier.id);
    }

    validate(): ValidationResult {
      const ruleIssues = this.findIssues();
      const { budget: skillBudgetIssues, ranks: skillRankIssues } = this.getSkillValidationIssues();

      // Insert skill issues after aptitude issues to preserve original ordering
      const aptitudeEndIndex = ruleIssues.findLastIndex((i) => i.category === "aptitudes") + 1;
      const issues = [
        ...ruleIssues.slice(0, aptitudeEndIndex),
        ...skillBudgetIssues,
        ...skillRankIssues,
        ...ruleIssues.slice(aptitudeEndIndex),
      ];
      return { valid: issues.length === 0, issues };
    }
  }

  return Validating;
}
