import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { pageOf, type Paginated } from "@/server/repositories/BaseRepository.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type {
  PropertyType,
  PropertyTypeCompletion,
  PropertyValueCompletion,
} from "@/shared/customization/properties.ts";

class PropertyTypesService {
  /**
   * The ruleset's custom property types (of one entity type, and containing `query`, when given): each with how many
   * properties use it, the most used first.
   */
  private countPropertyTypes(rulesetData: CachedRulesetData, entityType?: PropertyEntityType, query = "") {
    const counts = new Map<string, { type: string; entityType: string; count: number }>();
    const groups = entityType
      ? [rulesetData.propertiesByEntityType.get(entityType) ?? []]
      : [...rulesetData.propertiesByEntityType.values()];
    for (const prop of groups.flat()) {
      if (!prop.type.toLowerCase().includes(query)) continue;
      const key = `${prop.entityType}:${prop.type}`;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { type: prop.type, entityType: prop.entityType, count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }

  /**
   * Get all available property types (static + custom)
   */
  async getPropertyTypes(rulesetId: string, entityType?: PropertyEntityType): Promise<PropertyType[]> {
    const staticTypes = await this.getStaticPropertyTypes(rulesetId, entityType);
    const customTypes = await this.getCustomPropertyTypes(rulesetId, entityType);

    return [...staticTypes, ...customTypes];
  }

  /**
   * Get static property types via ruleset-specific provider
   */
  async getStaticPropertyTypes(rulesetId: string, entityType?: PropertyEntityType): Promise<PropertyType[]> {
    const provider = await RulesetFactory.fromRulesetId(rulesetId).then((m) => m.createPropertyTypes());
    const types = provider.getStaticPropertyTypes(entityType);

    return Object.entries(types).map(([value, description]) => ({
      value,
      isStatic: true,
      description,
    }));
  }

  /**
   * Get custom property types composed from the ruleset (chain + COW).
   * Aggregated by (type, entityType) with usage count = number of rows
   * that share that pair across the resolved properties.
   */
  async getCustomPropertyTypes(rulesetId: string, entityType?: PropertyEntityType): Promise<PropertyType[]> {
    return await withRulesetScope(db, rulesetId, async ({ rulesetData }) => {
      return this.countPropertyTypes(rulesetData, entityType).map((c): PropertyType => ({
        value: c.type,
        isStatic: false,
        entityType: c.entityType,
        usageCount: c.count,
      }));
    });
  }

  /**
   * Search property types by query
   */
  async searchPropertyTypes(
    rulesetId: string,
    query: string,
    entityType?: PropertyEntityType,
  ): Promise<PropertyType[]> {
    const lowercaseQuery = query.toLowerCase();

    const staticTypes = (await this.getStaticPropertyTypes(rulesetId, entityType)).filter(
      (type) =>
        type.value.toLowerCase().includes(lowercaseQuery) ||
        (type.description && type.description.toLowerCase().includes(lowercaseQuery)),
    );

    const customTypes = (await this.getCustomPropertyTypes(rulesetId, entityType)).filter((type) =>
      type.value.toLowerCase().includes(lowercaseQuery),
    );

    return [...staticTypes, ...customTypes];
  }

  /**
   * Get property type completions for autocomplete. Engine types come from the
   * per-baseRules provider; custom types come from `rulesetData` (composed
   * across the ruleset chain with COW resolution). Pagination is in-memory.
   */
  async getCompletions(
    rulesetId: string,
    query: string,
    pagination: { limit: number; page: number },
    entityType?: PropertyEntityType,
  ): Promise<Paginated<PropertyTypeCompletion>> {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const lowercaseQuery = query.toLowerCase();
      const provider = RulesetFactory.fromBaseRules(ruleset.baseRules).createPropertyTypes();

      const staticTypes = Object.entries(provider.getStaticPropertyTypes(entityType));
      const engineCompletions: PropertyTypeCompletion[] = staticTypes
        .filter(
          ([value, description]) =>
            value.toLowerCase().includes(lowercaseQuery) ||
            (description && description.toLowerCase().includes(lowercaseQuery)),
        )
        .map(([value, description]): PropertyTypeCompletion => ({
          label: value,
          value,
          detail: description,
          kind: "engine",
          entityType,
        }));

      const customCompletions = this.countPropertyTypes(rulesetData, entityType, lowercaseQuery).map(
        (c): PropertyTypeCompletion => ({
          label: c.type,
          value: c.type,
          detail: `Used ${c.count} time${c.count !== 1 ? "s" : ""} in ${c.entityType}`,
          kind: "custom",
          entityType: c.entityType,
        }),
      );

      return pageOf([...engineCompletions, ...customCompletions], pagination);
    });
  }

  /**
   * Get value completions for a given property type. Engine values come from
   * the per-baseRules provider; custom values come from `rulesetData`
   * (composed across the ruleset chain). Pagination is in-memory.
   */
  async getValueCompletions(
    rulesetId: string,
    type: string,
    query: string,
    pagination: { limit: number; page: number },
  ): Promise<Paginated<PropertyValueCompletion>> {
    return await withRulesetScope(db, rulesetId, async ({ ruleset, rulesetData }) => {
      const lowercaseQuery = query.toLowerCase();
      const provider = RulesetFactory.fromBaseRules(ruleset.baseRules).createPropertyTypes();

      const staticValues = provider.getStaticPropertyValues(type) ?? [];
      const engineCompletions: PropertyValueCompletion[] = staticValues
        .filter((v) => v.toLowerCase().includes(lowercaseQuery))
        .map((v): PropertyValueCompletion => ({ label: v, value: v, kind: "engine" }));

      const engineValueSet = new Set(staticValues);
      const seen = new Set<string>();
      const customValues: string[] = [];
      for (const group of rulesetData.propertiesByEntityType.values()) {
        for (const prop of group) {
          if (prop.type !== type) continue;
          if (engineValueSet.has(prop.value)) continue;
          if (query && !prop.value.toLowerCase().includes(lowercaseQuery)) continue;
          if (seen.has(prop.value)) continue;
          seen.add(prop.value);
          customValues.push(prop.value);
        }
      }

      const customCompletions: PropertyValueCompletion[] = customValues
        .sort((a, b) => a.localeCompare(b))
        .map((v): PropertyValueCompletion => ({ label: v, value: v, kind: "custom" }));

      return pageOf([...engineCompletions, ...customCompletions], pagination);
    });
  }
}

export default new PropertyTypesService();
