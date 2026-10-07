import type { Components, TargetPathsInterface, TraversePathResult } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog, TargetPathKind } from "@/shared/customization/target.ts";

import type { PathCategory } from "./PathCategory.ts";
import PathTraverser from "./PathTraverser.ts";
import { readComponent } from "./readComponent.ts";

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
    const data = readComponent(component, mapping.getter);
    if (!data) return PathTraverser.failed(component, target, `${this.labelOf[category]} not found`);
    return this.traverser.traverse(component, rest, data, category, 0, [category]);
  }

  getCategories(): string[] {
    return this.categories.map(({ name }) => name);
  }

  getCategoryDescriptions(): Record<string, string> {
    return Object.fromEntries(this.categories.map(({ name, description }) => [name, description]));
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
}
