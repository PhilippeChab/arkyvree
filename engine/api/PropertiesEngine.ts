import { PropertyEdits } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/** The engine bound to an entity's properties (`entityType`, `entityId`): described, and what their saves store. */
export default class PropertiesEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly entityType: string,
    private readonly entityId: string,
  ) {}

  /** The entity's properties of its type, as the view composes them. */
  describeAll() {
    return PropertyEdits.describeAll(this.view, this.entityType, this.entityId);
  }

  /** A new property on the entity: the entity, as the view has it. */
  planCreate() {
    return PropertyEdits.planCreate(this.view, this.entityType, this.entityId);
  }

  /** Deleting one of the properties the entity shows: refused for one its template gives it. */
  planDelete(propertyId: string) {
    return PropertyEdits.planDelete(this.view, this.entityType, this.entityId, propertyId);
  }

  /** One of the properties the entity shows' edit: the property, and whether the edit overrides its template's. */
  planEdit(propertyId: string) {
    return PropertyEdits.planEdit(this.view, this.entityType, this.entityId, propertyId);
  }
}
