import type { PropertyTypesProvider } from "@/server/rulesets/engine/types.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { ENTITY_PROPERTY_TYPES, getStaticPropertyValues } from "@/shared/dnd3.5/properties/index.ts";

export default class Dnd35PropertyTypes implements PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: PropertyEntityType): Record<string, string> {
    if (!entityType) return Object.assign({}, ...Object.values(ENTITY_PROPERTY_TYPES));

    return ENTITY_PROPERTY_TYPES[entityType] ?? {};
  }

  getStaticPropertyValues(type: string): string[] | null {
    return getStaticPropertyValues(type);
  }
}
