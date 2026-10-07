import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";
import type { Ruleset } from "@/shared/relations.ts";

import type { RulesetData } from "./view/index.ts";

/**
 * A character component (abilities, skills, combat, etc.): a class instance whose getters the target paths call
 * by name (`readComponent`).
 */
export type Component = object;

export type Components = Record<string, Component>;

export interface PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: PropertyEntityType): Record<string, string>;
  getStaticPropertyValues(type: string): string[] | null;
}

export type RequirementIssue = {
  category: "requirements";
  entityName?: string;
  entityType?: string;
  message: string;
  requirementTree?: string;
};

/** A ruleset as a character's build reads it: its row, and its view, composed by copy-on-write. */
export interface RulesetView {
  ruleset: Ruleset;
  rulesetData: RulesetData;
}

export interface TargetPathsInterface extends TargetPathsTraverser {
  getCategories(): string[];
  getCategoryDescriptions(): Record<string, string>;
  /** The categories whose paths name an entity under their group, whose segment a description skips */
  getEntityNamingCategories(): string[];
  getGroupDescriptionTemplates(): Record<string, string>;
  getPathDescriptions(): Record<string, string>;
  getTargetPathsAndLabels(rulesetData: RulesetData, kind: TargetPathKind): TargetPathCatalog;
}
export interface TargetPathsTraverser {
  /** Whether a target reads its source itself (a weapon's own paths: the place its item is held), not the sheet. */
  readsSource(target: string): boolean;
  traversePathInit(target: string, components: Components, context?: { sourceId?: string }): TraversePathResult[];
}

export type TraversePathResult = {
  component: Component | null;
  data: unknown;
  error: string | null;
  key: string;
  object: unknown;
  resolvedPath: string | null;
};

export type ValidationIssue = {
  category: "aptitudes" | "skills" | "requirements" | "modifiers" | "integrity";
  entityName?: string;
  entityType?: string;
  message: string;
  requirementTree?: string;
};

export type ValidationResult = {
  issues: ValidationIssue[];
  valid: boolean;
};
