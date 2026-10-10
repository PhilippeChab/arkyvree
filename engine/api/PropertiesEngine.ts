import { PropertyEdits } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** The engine bound to an entity's properties (`entityType`, `entityId`): described, and what their saves store. */
export default class PropertiesEngine {
  constructor(view: RulesetView, entityType: string, entityId: string) {
    this.properties = new PropertyEdits(view, entityType, entityId);
  }

  /** The entity's properties, which its operations ask. */
  private readonly properties: PropertyEdits;

  /** The entity's properties of its type, as the view composes them, each named for the entity its value names. */
  describeAll() {
    return this.properties.describeAll();
  }

  /** A new property on the entity: the entity, as the view has it. */
  planCreate() {
    return this.properties.planCreate();
  }

  /** Deleting one of the properties the entity shows: refused for one its template gives it. */
  planDelete(propertyId: string) {
    return this.properties.planDelete(propertyId);
  }

  /** One of the properties the entity shows' edit: the property, and whether the edit overrides its template's. */
  planEdit(propertyId: string) {
    return this.properties.planEdit(propertyId);
  }
}
