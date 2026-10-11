import type { RulesetData } from "@/engine/core/view/index.ts";

/** The label a property's value shows: the name of the entity it names, when its type names one by its id. */
export default class PropertyLabels {
  /**
   * Properties as a list shows them, an entity's Properties tab or its page: each with the name of the entity its value
   * names (`valueLabel`, a class's bonus spell ability's "Wisdom"), when its type names one (the ruleset's property
   * types say which) and the view has it; none otherwise, its value shown as it is.
   */
  static describe<T extends { type: string; value: string }>(rulesetData: RulesetData, properties: readonly T[]) {
    return properties.map((property) => {
      const entityType = rulesetData.propertyTypes.getReferencedEntityType(property.type);
      const entity = entityType ? rulesetData.find(entityType, property.value) : undefined;
      return { ...property, valueLabel: entity?.name ?? null };
    });
  }
}
