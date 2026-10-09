import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { Property } from "@/shared/relations.ts";

import CustomizedEntity from "./CustomizedEntity.ts";

/** An entity's properties: as its page lists them, and what their saves store. */
export default class PropertyEdits {
  /**
   * A property shown on the entity, looked up like requirements and modifiers: its own and visible sibling
   * contributions. A derived item also shows its template's properties (`fromTemplate`), which an edit overrides on
   * the item. Refused as not found otherwise.
   */
  private static findShown(view: RulesetView, entityType: string, entityId: string, propertyId: string) {
    const { rulesetData } = view;
    const matches = (p: Property) => p.id === propertyId && p.entityType === entityType;
    const own = rulesetData.propertiesByEntity.get(entityId)?.find(matches);
    if (own) return { property: own, fromTemplate: false };
    const sourceItemId = entityType === "items" ? rulesetData.itemsById.get(entityId)?.sourceItemId : undefined;
    const inherited = sourceItemId ? rulesetData.propertiesByEntity.get(sourceItemId)?.find(matches) : undefined;
    if (inherited) return { property: inherited, fromTemplate: true };
    throw new RulesError("not-found", "Property not found for this entity");
  }

  /** An entity's properties of its type, as its view composes them. */
  static describeAll(view: RulesetView, entityType: string, entityId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    const properties = view.rulesetData.propertiesByEntity.get(entity.id) ?? [];
    return properties.filter((property) => property.entityType === entityType);
  }

  /** A new property on an entity: the entity as the view has it. */
  static planCreate(view: RulesetView, entityType: string, entityId: string) {
    return { entity: CustomizedEntity.find(view, entityType, entityId) };
  }

  /**
   * Deleting a property the entity shows: the entity and the property. Refused when it's its template's, which the
   * item doesn't own.
   */
  static planDelete(view: RulesetView, entityType: string, entityId: string, propertyId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    const { property, fromTemplate } = PropertyEdits.findShown(view, entityType, entity.id, propertyId);
    if (fromTemplate) throw new RulesError("invalid", "Cannot delete a property inherited from a template");
    return { entity, property };
  }

  /**
   * An edit of a property the entity shows: the entity and the property, and whether the edit overrides its template's
   * on the item (`override`), which makes a property of the item's own.
   */
  static planEdit(view: RulesetView, entityType: string, entityId: string, propertyId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    const { property, fromTemplate } = PropertyEdits.findShown(view, entityType, entity.id, propertyId);
    return { entity, override: fromTemplate, property };
  }
}
