import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { ENTITY_PROPERTY_TYPES, PROPERTY_VALUES } from "@/vocabulary/dnd3.5/properties/index.ts";

/** The property types the 3.5 rules read, by the entity they're on, and the values each takes when it has a set. */
export default class Dnd35PropertyTypes implements PropertyTypesProvider {
  /** The values a property type takes, in their order, when it has a set: none for a free-text type. */
  static valuesOf(type: string): string[] | null {
    return PROPERTY_VALUES[type] ?? null;
  }

  getStaticPropertyTypes(entityType?: PropertyEntityType): Record<string, string> {
    if (!entityType) return Object.assign({}, ...Object.values(ENTITY_PROPERTY_TYPES));

    return ENTITY_PROPERTY_TYPES[entityType] ?? {};
  }

  getStaticPropertyValues(type: string): string[] | null {
    return Dnd35PropertyTypes.valuesOf(type);
  }
}
