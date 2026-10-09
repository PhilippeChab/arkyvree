import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type {
  PathCompletion,
  PathValidationResult,
  TargetPathCatalog,
  TargetPathKind,
} from "@/shared/customization/target.ts";
import type { Ruleset } from "@/shared/relations.ts";

import type { RulesetData } from "./view/index.ts";

/**
 * A character component (abilities, skills, combat, etc.): a class instance whose getters the target paths call
 * by name (`PathTraverser.readComponent`).
 */
export type Component = object;

export type Components = Record<string, Component>;

/** What a path's completions are asked for: the partial path up to `position`, or every leaf matching `search` (`flat`). */
export type PathQuery = { flat?: boolean; partialPath: string; position: number; search?: string };

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
/** A modifier's or a requirement's target, operator and value, which its path's check reads. */
export type TargetCheck = {
  kind: "modifier" | "requirement";
  operator?: string;
  sourceType?: string;
  target: string;
  value?: string;
};

export interface TargetPathsInterface extends TargetPathsTraverser {
  /** The value type of the path a modifier or requirement targets, its operator and value checked against it. */
  checkTargetValue(
    catalogs: { paths: TargetPathCatalog; templatePaths: TargetPathCatalog },
    check: TargetCheck,
  ): string;
  /** The completions of a partial path among a catalog's paths of `kind`, unpaged. */
  completeTargetPath(catalog: TargetPathCatalog, kind: TargetPathKind, query: PathQuery): PathCompletion[];
  getCategories(): string[];
  getCategoryDescriptions(): Record<string, string>;
  /** The categories whose paths name an entity under their group, whose segment a description skips */
  getEntityNamingCategories(): string[];
  getGroupDescriptionTemplates(): Record<string, string>;
  getPathDescriptions(): Record<string, string>;
  getTargetPathsAndLabels(rulesetData: RulesetData, kind: TargetPathKind): TargetPathCatalog;
  /** A target path validated like a language server, among a catalog's paths. */
  validateTargetPath(catalog: TargetPathCatalog, path: string): PathValidationResult;
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
