import type { PropertyDeclaration, PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { ENTITY_PROPERTY_TYPES, PROPERTY_REFERENCES, PROPERTY_VALUES } from "@/vocabulary/dnd3.5/properties/index.ts";

/**
 * The property types the 3.5 rules read, by the entity they're on (each with its field's label and what it's for), the
 * values each takes when they're a closed list, and the entity kind one's value names by its id.
 */
export default class Dnd35PropertyTypes implements PropertyTypesProvider {
  /** The values a property type takes, in their order, when they're a closed list: none for a free-text type. */
  static valuesOf(type: string): string[] | null {
    return PROPERTY_VALUES[type] ?? null;
  }

  getDeclarations(entityType?: PropertyEntityType): Readonly<Record<string, PropertyDeclaration>> {
    if (!entityType) return Object.assign({}, ...Object.values(ENTITY_PROPERTY_TYPES));
    return ENTITY_PROPERTY_TYPES[entityType] ?? {};
  }

  getReferencedEntityType(type: string) {
    return PROPERTY_REFERENCES[type] ?? null;
  }

  getValues(type: string): string[] | null {
    return Dnd35PropertyTypes.valuesOf(type);
  }
}
