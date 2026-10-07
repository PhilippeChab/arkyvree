import type { Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/engine/types.ts";

import type { PathCategory } from "./PathCategory.ts";
import PathTraverser from "./PathTraverser.ts";
import { readHolder } from "./readHolder.ts";

/** A ruleset's target paths, by category: how a target reaches its data, and how the path picker describes them. */
export default abstract class CategoryPaths implements TargetPathsTraverser {
  constructor(private readonly categories: readonly PathCategory[]) {
    this.byName = new Map(categories.map((category) => [category.name, category]));
    this.holderOf = Object.fromEntries(categories.flatMap(({ name, holder }) => (holder ? [[name, holder]] : [])));
    this.labelOf = Object.fromEntries(categories.map(({ name, label }) => [name, label]));
    this.traverser = new PathTraverser(
      new Set(categories.filter((category) => category.expandsSubtypes).map((category) => category.name)),
    );
  }

  private readonly byName: ReadonlyMap<string, PathCategory>;

  private readonly holderOf: Record<string, { key: string; getter: string }>;

  private readonly labelOf: Record<string, string>;

  protected readonly traverser: PathTraverser;

  /** A category's data, from its holder's getter, traversed with the rest of the path. */
  private traverseCategory(target: string, category: string, rest: string[], holders: Holders): TraversePathResult[] {
    const mapping = this.holderOf[category];
    if (!mapping) return PathTraverser.failed(null, target, `Unknown category: ${category}`);
    const holder = holders[mapping.key];
    if (!holder) return PathTraverser.failed(null, target, `${this.labelOf[category]} holder not found`);
    const data = readHolder(holder, mapping.getter);
    if (!data) return PathTraverser.failed(holder, target, `${this.labelOf[category]} not found`);
    return this.traverser.traverse(holder, rest, data, category, 0, [category]);
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

  /** Whether a target reads its source itself, not the sheet: its category says. */
  readsSource(target: string): boolean {
    const [category] = target.split(".");
    return this.byName.get(category)?.readsSource?.(target) ?? false;
  }

  /** A target's values: its category's own resolution, or its category's data walked by the path (category.item.property). */
  traversePathInit(target: string, holders: Holders, context?: { sourceId?: string }): TraversePathResult[] {
    try {
      const [category, ...rest] = target.split(".");
      const resolved = this.byName.get(category)?.resolve?.(target, rest, holders, this.traverser, context);
      if (resolved) return resolved;
      return this.traverseCategory(target, category, rest, holders);
    } catch (error) {
      return PathTraverser.failed(null, target, `Failed to traverse path: ${error}`);
    }
  }
}
