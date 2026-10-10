import RulesError from "@/engine/core/RulesError.ts";
import type { Property } from "@/shared/relations.ts";

import CustomizationEdits from "./CustomizationEdits.ts";

/** An entity's properties: as its page lists them, and what their saves store. */
export default class PropertyEdits extends CustomizationEdits<Property> {
  protected readonly label = "Property";

  /**
   * A property the entity shows: its own, or a derived item's template's (`fromTemplate`), which an edit overrides on
   * the item. Refused as not found otherwise.
   */
  private findShown(entityId: string, propertyId: string) {
    const own = this.rowsOf(entityId).find((property) => property.id === propertyId);
    if (own) return { property: own, fromTemplate: false };
    const { rulesetData } = this.view;
    const sourceItemId = this.entityType === "items" ? rulesetData.itemsById.get(entityId)?.sourceItemId : undefined;
    const inherited = sourceItemId
      ? this.rowsOf(sourceItemId).find((property) => property.id === propertyId)
      : undefined;
    if (inherited) return { property: inherited, fromTemplate: true };
    throw new RulesError("not-found", `${this.label} not found for this entity`);
  }

  /** The entity's properties of its type: its own, and its siblings' (the view composes them into the winner's). */
  protected rowsOf(entityId: string) {
    const properties = this.view.rulesetData.propertiesByEntity.get(entityId) ?? [];
    return properties.filter((property) => property.entityType === this.entityType);
  }

  /** The entity's properties of its type, as the view composes them. */
  describeAll() {
    return this.rowsOf(this.entity.id);
  }

  /** A new property on the entity: the entity as the view has it. */
  planCreate() {
    return { entity: this.entity };
  }

  /**
   * Deleting a property the entity shows: the entity and the property. Refused when it's its template's, which the
   * item doesn't own.
   */
  planDelete(propertyId: string) {
    const { entity } = this;
    const { property, fromTemplate } = this.findShown(entity.id, propertyId);
    if (fromTemplate) throw new RulesError("invalid", "Cannot delete a property inherited from a template");
    return { entity, property };
  }

  /**
   * An edit of a property the entity shows: the entity and the property, and whether the edit overrides its template's
   * on the item (`override`), which makes a property of the item's own.
   */
  planEdit(propertyId: string) {
    const { entity } = this;
    const { property, fromTemplate } = this.findShown(entity.id, propertyId);
    return { entity, override: fromTemplate, property };
  }
}
