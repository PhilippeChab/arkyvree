import RulesError from "@/engine/core/RulesError.ts";
import { RequestIds } from "@/engine/core/view/index.ts";
import type { Property } from "@/shared/relations.ts";

import CustomizationEdits from "./CustomizationEdits.ts";
import PropertyLabels from "./PropertyLabels.ts";

/** A property's form: its type, and its value. */
interface PropertyForm {
  type: string;
  value: string;
}

/** An entity's properties: as its page lists them, and what their saves store. */
export default class PropertyEdits extends CustomizationEdits<Property> {
  protected override readonly label = "Property";

  /** The entity's properties of its type: its own, and its siblings' (the view composes them into the winner's). */
  protected override rowsOf(entityId: string) {
    const properties = this.view.rulesetData.propertiesByEntity.get(entityId) ?? [];
    return properties.filter((property) => property.entityType === this.entityType);
  }

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

  /**
   * The value a property's form stores on the entity: the id of the entity its type names (a class's bonus spell
   * ability), the one the view shows (a copy's for its source's id), refused, naming it, when it shows none; any other
   * value as it is. Refused as a conflict when another of the entity's properties of its type (but the one an edit
   * changes, `except`) holds it already: an entity holds a type's value once (the table's key, which a second row would
   * break as a server error).
   */
  private storedValueOf(entity: { id: string; name: string }, { type, value }: PropertyForm, except?: string) {
    const { rulesetData } = this.view;
    const entityType = rulesetData.propertyTypes.getReferencedEntityType(type);
    const stored = entityType ? new RequestIds(rulesetData, "this ruleset").resolve(entityType, value) : value;
    const held = this.rowsOf(entity.id).some(
      (property) => property.id !== except && property.type === type && property.value === stored,
    );
    if (held) {
      const label = entityType ? (rulesetData.find(entityType, stored)?.name ?? stored) : stored;
      throw new RulesError("conflict", `${entity.name}'s ${type} already holds ${label}`);
    }
    return stored;
  }

  /**
   * The entity's properties of its type, as the view composes them, each named for the entity its value names
   * (`PropertyLabels`).
   */
  describeAll() {
    return PropertyLabels.describe(this.view.rulesetData, this.rowsOf(this.entity.id));
  }

  /** A new property on the entity (`form`): the entity as the view has it, and the value it stores. */
  planCreate(form: PropertyForm) {
    const { entity } = this;
    return { entity, value: this.storedValueOf(entity, form) };
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
   * An edit of a property the entity shows (`form`): the entity and the property, whether the edit overrides its
   * template's on the item (`override`), which makes a property of the item's own, and the value it stores.
   */
  planEdit(propertyId: string, form: PropertyForm) {
    const { entity } = this;
    const { property, fromTemplate } = this.findShown(entity.id, propertyId);
    const value = this.storedValueOf(entity, form, fromTemplate ? undefined : property.id);
    return { entity, override: fromTemplate, property, value };
  }
}
