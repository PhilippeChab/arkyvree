import type { RulesetData } from "@/engine/core/view/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { PropertyTypeCompletion, PropertyValueCompletion } from "@/shared/customization/properties.ts";

/** A property type a ruleset lists: the rules' (static), or one its properties use, with how many. */
interface PropertyType {
  description?: string;
  entityType?: string;
  isStatic: boolean;
  usageCount?: number;
  value: string;
}

export interface PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: PropertyEntityType): Record<string, string>;
  getStaticPropertyValues(type: string): string[] | null;
}

/**
 * The property types and values a ruleset's properties take: those its rules read (`provider`), then those its own
 * properties use, as its view composes them across its chain.
 */
export default class PropertyTypeCatalog {
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly provider: PropertyTypesProvider,
  ) {}

  /**
   * The ruleset's own property types (of one entity type, when given) containing `query`: each with how many of its
   * properties use it, the most used first.
   */
  private countCustomTypes(query: string, entityType?: PropertyEntityType) {
    const counts = new Map<string, { count: number; entityType: string; type: string }>();
    const groups = entityType
      ? [this.rulesetData.propertiesByEntityType.get(entityType) ?? []]
      : [...this.rulesetData.propertiesByEntityType.values()];
    for (const prop of groups.flat()) {
      if (!prop.type.toLowerCase().includes(query)) continue;
      const key = `${prop.entityType}:${prop.type}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { type: prop.type, entityType: prop.entityType, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }

  /** The types the ruleset's rules read (of one entity type, when given) whose name or description contains `query`. */
  private matchStaticTypes(query: string, entityType?: PropertyEntityType) {
    return Object.entries(this.provider.getStaticPropertyTypes(entityType)).filter(
      ([value, description]) => value.toLowerCase().includes(query) || description.toLowerCase().includes(query),
    );
  }

  /**
   * The types an autocomplete offers for `query` (ignoring case): the rules' types, then the ruleset's own, each
   * described by its use.
   */
  completeTypes(query: string, entityType?: PropertyEntityType): PropertyTypeCompletion[] {
    const lowercaseQuery = query.toLowerCase();
    const staticTypes = this.matchStaticTypes(lowercaseQuery, entityType).map(
      ([value, description]): PropertyTypeCompletion => ({
        label: value,
        value,
        detail: description,
        kind: "engine",
        entityType,
      }),
    );
    const customTypes = this.countCustomTypes(lowercaseQuery, entityType).map((c): PropertyTypeCompletion => ({
      label: c.type,
      value: c.type,
      detail: `Used ${c.count} time${c.count !== 1 ? "s" : ""} in ${c.entityType}`,
      kind: "custom",
      entityType: c.entityType,
    }));
    return [...staticTypes, ...customTypes];
  }

  /**
   * The values an autocomplete offers for a property of `type`, containing `query` (ignoring case): the rules' values,
   * then the others the ruleset's properties of that type take, once each, sorted.
   */
  completeValues(type: string, query: string): PropertyValueCompletion[] {
    const lowercaseQuery = query.toLowerCase();
    const staticValues = this.provider.getStaticPropertyValues(type) ?? [];
    const staticCompletions = staticValues
      .filter((v) => v.toLowerCase().includes(lowercaseQuery))
      .map((v): PropertyValueCompletion => ({ label: v, value: v, kind: "engine" }));

    const staticValueSet = new Set(staticValues);
    const customValues = new Set<string>();
    for (const group of this.rulesetData.propertiesByEntityType.values()) {
      for (const prop of group) {
        if (prop.type !== type || staticValueSet.has(prop.value)) continue;
        if (prop.value.toLowerCase().includes(lowercaseQuery)) customValues.add(prop.value);
      }
    }
    const customCompletions = [...customValues]
      .sort((a, b) => a.localeCompare(b))
      .map((v): PropertyValueCompletion => ({ label: v, value: v, kind: "custom" }));
    return [...staticCompletions, ...customCompletions];
  }

  /**
   * The property types (of one entity type, when given) containing `query`, ignoring case: the rules' types, matched by
   * name or description, then the ruleset's own, matched by name, each with its use.
   */
  listTypes(query: string, entityType?: PropertyEntityType): PropertyType[] {
    const lowercaseQuery = query.toLowerCase();
    const staticTypes = this.matchStaticTypes(lowercaseQuery, entityType).map(([value, description]): PropertyType => ({
      value,
      isStatic: true,
      description,
    }));
    const customTypes = this.countCustomTypes(lowercaseQuery, entityType).map((c): PropertyType => ({
      value: c.type,
      isStatic: false,
      entityType: c.entityType,
      usageCount: c.count,
    }));
    return [...staticTypes, ...customTypes];
  }
}
