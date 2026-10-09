import type {
  Components,
  PathQuery,
  TargetCheck,
  TargetPathsInterface,
  TraversePathResult,
} from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type {
  PathCompletion,
  PathValidationResult,
  TargetPathCatalog,
  TargetPathKind,
} from "@/shared/customization/target.ts";
import { stripSeparators } from "@/shared/text.ts";

import type { PathCategory } from "./PathCategory.ts";
import PathChecks from "./PathChecks.ts";
import PathCompletions from "./PathCompletions.ts";
import PathTraverser from "./PathTraverser.ts";

/**
 * A ruleset's target paths, by category: the paths each lists, how a target reaches its data, and how the path picker
 * labels and describes them.
 */
export default abstract class CategoryPaths<C = Components> implements TargetPathsInterface {
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

  /** The labels of the ruleset's own names (its entities', its properties' values), added to the categories'. */
  protected abstract labelNames(
    rulesetData: RulesetData,
    segmentLabels: Record<string, string>,
  ): Record<string, string>;

  /** A category's data, from its component's getter, traversed with the rest of the path. */
  private traverseCategory(
    target: string,
    category: string,
    rest: string[],
    components: Components,
  ): TraversePathResult[] {
    const mapping = this.componentOf[category];
    if (!mapping) return PathTraverser.failed(null, target, `Unknown category: ${category}`);
    const component = components[mapping.key];
    if (!component) return PathTraverser.failed(null, target, `${this.labelOf[category]} holder not found`);
    const data = PathTraverser.readComponent(component, mapping.getter);
    if (!data) return PathTraverser.failed(component, target, `${this.labelOf[category]} not found`);
    return this.traverser.traverse(component, rest, data, category, 0, [category]);
  }

  /**
   * The value type of the path a modifier or requirement targets, among the catalog of its kind (`paths`), its operator
   * and value checked against it, a template against the paths a template reads (`templatePaths`): refused as invalid
   * with what's wrong.
   */
  checkTargetValue(
    catalogs: { paths: TargetPathCatalog; templatePaths: TargetPathCatalog },
    check: TargetCheck,
  ): string {
    return new PathChecks(this.getCategories(), catalogs.paths).checkValue(catalogs.templatePaths, check);
  }

  /**
   * The completions of a partial path among a catalog's paths of `kind` (those an entity type takes, `entityType`),
   * unpaged.
   */
  completeTargetPath(
    catalog: TargetPathCatalog,
    kind: TargetPathKind,
    query: PathQuery,
    entityType?: string,
  ): PathCompletion[] {
    return new PathCompletions(this, CategoryPaths.pathsFor(catalog, entityType), kind).complete(query);
  }

  getCategories(): string[] {
    return this.categories.map(({ name }) => name);
  }

  getCategoryDescriptions(): Record<string, string> {
    return Object.fromEntries(this.categories.map(({ name, description }) => [name, description]));
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
   * Every path each category lists, in the categories' order, and each segment's label. A template's paths are the
   * requirement's that read one value from the sheet: no wildcard, no path that reaches several values or a list
   * (`readsMany`), and none that reads its source (an item's own weapon), which a template has none of.
   */
  getTargetPathsAndLabels(rulesetData: RulesetData, kind: TargetPathKind): TargetPathCatalog {
    if (kind === "template") {
      const { paths, segmentLabels } = this.getTargetPathsAndLabels(rulesetData, "requirement");
      return {
        paths: paths.filter(({ path, readsMany }) => !readsMany && !path.includes("*") && !this.readsSource(path)),
        segmentLabels,
      };
    }
    const segmentLabels: Record<string, string> = {
      "*": "All",
      ...this.labelOf,
      ...Object.assign({}, ...this.categories.map((category) => category.getSegmentLabels?.())),
    };
    return {
      paths: this.categories.flatMap((category) => category.generate?.(rulesetData, kind) ?? []),
      segmentLabels: this.labelNames(rulesetData, segmentLabels),
    };
  }

  /** Whether a target reads its source itself, not the sheet: its category says. */
  readsSource(target: string): boolean {
    const [category] = target.split(".");
    return this.byName.get(category)?.readsSource?.(target) ?? false;
  }

  /** A target's values: its category's own resolution, or its category's data walked by the path (category.item.property). */
  traversePathInit(target: string, components: Components, context?: { sourceId?: string }): TraversePathResult[] {
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
  validateTargetPath(catalog: TargetPathCatalog, path: string, entityType?: string): PathValidationResult {
    return new PathChecks(this.getCategories(), CategoryPaths.pathsFor(catalog, entityType)).validate(path);
  }
}
