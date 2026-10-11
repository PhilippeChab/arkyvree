import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type {
  PathCompletion,
  PathValidationResult,
  TargetPathCatalog,
  TargetPathKind,
} from "@/shared/customization/target.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { PathCategory, PathContext } from "./PathCategory.ts";
import PathChecks, { type TargetCheck } from "./PathChecks.ts";
import PathCompletions, { type PathQuery } from "./PathCompletions.ts";
import PathTraverser, { type Components, type TraversePathResult } from "./PathTraverser.ts";

/** The target paths of a customization's kind and of a template's, which a value is checked against. */
export interface TargetCatalogs {
  paths: TargetPathCatalog;
  templatePaths: TargetPathCatalog;
}

export interface TargetPaths extends TargetPathsTraverser {
  /** The value type of the path a modifier or requirement targets, its operator and value checked against it. */
  checkValue(catalogs: TargetCatalogs, check: TargetCheck): string;
  getCategories(): string[];
  getCategoryDescriptions(): Record<string, string>;
  /** The completions of a partial path among a catalog's paths of `kind`, unpaged. */
  getCompletions(
    catalog: TargetPathCatalog,
    kind: TargetPathKind,
    query: PathQuery,
    entityType?: string,
  ): PathCompletion[];
  /** The categories whose paths name an entity under their group, whose segment a description skips */
  getEntityNamingCategories(): string[];
  getGroupDescriptionTemplates(): Record<string, string>;
  getPathDescriptions(): Record<string, string>;
  list(rulesetData: RulesetData, kind: TargetPathKind): TargetPathCatalog;
  /** A target path validated like a language server, among a catalog's paths. */
  validate(catalog: TargetPathCatalog, path: string, entityType?: string): PathValidationResult;
}

export interface TargetPathsTraverser {
  /**
   * Why a modifier can't set `target` to `value`, or undefined when it can: one on a path that grants what it names
   * names one entity and sets a literal.
   */
  findGrantError(target: string, value: string): string | undefined;
  /** Whether a target reads its source itself (a weapon's own paths: the place its item is held), not the sheet. */
  readsSource(target: string): boolean;
  /** A target's values, read in `context`: the item it's of, the part of the sheet it reads. */
  traversePathInit(target: string, components: Components, context?: PathContext): TraversePathResult[];
}

/**
 * A ruleset's target paths, by category: the paths each lists, how a target reaches its data, and how the path picker
 * labels and describes them.
 */
export default abstract class CategoryPaths<C = Components> implements TargetPaths {
  constructor(private readonly categories: readonly PathCategory<C>[]) {
    this.byName = new Map(categories.map((category) => [category.name, category]));
    this.componentOf = Object.fromEntries(
      categories.flatMap(({ name, component }) => (component ? [[name, component]] : [])),
    );
    this.labelOf = Object.fromEntries(categories.map(({ name, label }) => [name, label]));
    this.traverser = new PathTraverser(
      new Set(categories.filter((category) => category.expandsSubtypes).map((category) => category.name)),
    );
  }

  /** A catalog's paths an entity type takes (a path's `allowedEntityTypes`), all of them without one. */
  private static pathsFor(catalog: TargetPathCatalog, entityType?: string): TargetPathCatalog {
    if (!entityType) return catalog;
    return {
      paths: catalog.paths.filter((p) => !p.allowedEntityTypes || p.allowedEntityTypes.includes(entityType)),
      segmentLabels: catalog.segmentLabels,
    };
  }

  /** The distinct slugs of the properties' values of `type`. */
  static collectPropertySlugs(properties: { type: string; value: string }[], type: string) {
    return [...new Set(properties.filter((p) => p.type === type).map((p) => stripSeparators(p.value)))];
  }

  private readonly byName: ReadonlyMap<string, PathCategory<C>>;

  private readonly componentOf: Record<string, { getter: string; key: string }>;

  private readonly labelOf: Record<string, string>;

  protected readonly traverser: PathTraverser;

  /**
   * What a modifier on `target` grants (its category's `grants`, the target on its leaf: a feat's `possessed`), or
   * undefined for a target that grants nothing.
   */
  private grantOf(target: string) {
    const [category, ...rest] = target.split(".");
    const grants = this.byName.get(category)?.grants;
    return grants && rest.at(-1) === grants.leaf ? grants : undefined;
  }

  /**
   * Each segment's label: the categories' own (`getSegmentLabels`), then the ruleset's names, those that name a segment
   * over any other label first, those that only fill a gap after (`labelNames`), each category's in its order.
   */
  private labelSegments(rulesetData: RulesetData): Record<string, string> {
    const segmentLabels: Record<string, string> = {
      "*": "All",
      ...this.labelOf,
      ...Object.assign({}, ...this.categories.map((category) => category.getSegmentLabels?.())),
    };
    const named = this.categories.map((category) => category.labelNames?.(rulesetData) ?? {});
    for (const { names } of named) Object.assign(segmentLabels, names);
    for (const { fallbacks = {} } of named)
      for (const [segment, label] of Object.entries(fallbacks)) segmentLabels[segment] ??= label;
    return segmentLabels;
  }

  /** A category's data, from its component's getter, traversed with the rest of the path. */
  private traverseCategory(
    target: string,
    category: string,
    rest: string[],
    components: Components,
  ): TraversePathResult[] {
    const mapping = this.componentOf[category];
    if (!mapping) return PathTraverser.failed(null, target, `Unknown category: ${category}`);
    const component = PathTraverser.findComponent(components, mapping.key);
    if (!component) return PathTraverser.failed(null, target, `${this.labelOf[category]} holder not found`);
    const data = PathTraverser.readComponent(component, mapping.getter);
    if (!data) return PathTraverser.failed(component, target, `${this.labelOf[category]} not found`);
    return this.traverser.traverse(component, rest, data, category, 0, [category]);
  }

  /**
   * The value type of the path a modifier or requirement targets, among the catalog of its kind (`paths`), its operator
   * and value checked against it, a template against the paths a template reads (`templatePaths`), and a modifier on a
   * path that grants as a grant (`findGrantError`): refused as invalid with what's wrong.
   */
  checkValue(catalogs: TargetCatalogs, check: TargetCheck): string {
    const { kind, target, value } = check;
    const grantError = kind === "modifier" && value !== undefined ? this.findGrantError(target, value) : undefined;
    if (grantError) throw new RulesError("invalid", grantError);
    return new PathChecks(this.getCategories(), catalogs.paths).checkValue(catalogs.templatePaths, check);
  }

  /**
   * Why a modifier can't set `target` to `value`, or undefined when it can. A modifier on the leaf its category grants by
   * (`grants`: 3.5's feat's `possessed`) gives the entity its path names as it applies, in the build's rounds: so it
   * names one entity, never a wildcard, which would mark each of a family had without giving any, and sets a literal,
   * never a template, which applies after the rounds. A condition is the modifier's requirement. A requirement reads
   * such a path either way: any feat of a family, a template's value.
   */
  findGrantError(target: string, value: string): string | undefined {
    const grants = this.grantOf(target);
    if (!grants) return undefined;
    const { entity } = grants;
    if (target.includes("*"))
      return `${target} reaches several ${entity}s: a grant names the one ${entity} it gives, a modifier for each`;
    if (isTemplateValue(value))
      return `A grant sets ${target} to true, not to a template: to grant the ${entity} on a condition, set it true and require the condition on the modifier`;
    return undefined;
  }

  getCategories(): string[] {
    return this.categories.map(({ name }) => name);
  }

  getCategoryDescriptions(): Record<string, string> {
    return Object.fromEntries(this.categories.map(({ name, description }) => [name, description]));
  }

  /**
   * The completions of a partial path among a catalog's paths of `kind` (those an entity type takes, `entityType`),
   * unpaged.
   */
  getCompletions(
    catalog: TargetPathCatalog,
    kind: TargetPathKind,
    query: PathQuery,
    entityType?: string,
  ): PathCompletion[] {
    return new PathCompletions(this, CategoryPaths.pathsFor(catalog, entityType), kind).complete(query);
  }

  getEntityNamingCategories(): string[] {
    return this.categories.filter((category) => category.namesEntities).map(({ name }) => name);
  }

  getGroupDescriptionTemplates(): Record<string, string> {
    return Object.assign({}, ...this.categories.map(({ groupDescriptionTemplates }) => groupDescriptionTemplates));
  }

  getPathDescriptions(): Record<string, string> {
    return Object.assign({}, ...this.categories.map(({ pathDescriptions }) => pathDescriptions));
  }

  /**
   * Every path each category lists, in the categories' order, and each segment's label. A modifier's path that grants
   * (`grants`) takes a literal only (`literalOnly`), as its save does (`findGrantError`): the editor offers no template
   * there. A template's paths are the requirement's that read one value from the sheet: no wildcard, no path that
   * reaches several values or a list (`readsMany`), and none that reads its source (an item's own weapon), which a
   * template has none of.
   */
  list(rulesetData: RulesetData, kind: TargetPathKind): TargetPathCatalog {
    if (kind === "template") {
      const { paths, segmentLabels } = this.list(rulesetData, "requirement");
      return {
        paths: paths.filter(({ path, readsMany }) => !readsMany && !path.includes("*") && !this.readsSource(path)),
        segmentLabels,
      };
    }
    const paths = this.categories.flatMap((category) => category.generate?.(rulesetData, kind) ?? []);
    return {
      paths:
        kind === "modifier"
          ? paths.map((path) => (this.grantOf(path.path) ? { ...path, literalOnly: true } : path))
          : paths,
      segmentLabels: this.labelSegments(rulesetData),
    };
  }

  /** Whether a target reads its source itself, not the sheet: its category says. */
  readsSource(target: string): boolean {
    const [category] = target.split(".");
    return this.byName.get(category)?.readsSource?.(target) ?? false;
  }

  /**
   * A target's values, read in `context`: its category's own resolution, or its category's data walked by the path
   * (category.item.property).
   */
  traversePathInit(target: string, components: Components, context?: PathContext): TraversePathResult[] {
    try {
      const [category, ...rest] = target.split(".");
      const resolved = this.byName.get(category)?.resolve?.(target, rest, components, this.traverser, context);
      if (resolved) return resolved;
      return this.traverseCategory(target, category, rest, components);
    } catch (error) {
      return PathTraverser.failed(null, target, `Failed to traverse path: ${error}`);
    }
  }

  /**
   * A target path validated like a language server, among a catalog's paths (those an entity type takes, `entityType`):
   * a valid one carries its definition.
   */
  validate(catalog: TargetPathCatalog, path: string, entityType?: string): PathValidationResult {
    return new PathChecks(this.getCategories(), CategoryPaths.pathsFor(catalog, entityType)).validate(path);
  }
}
