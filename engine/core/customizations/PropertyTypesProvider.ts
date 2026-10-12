import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";

/** A property type as an entity type declares it: its field's label, what it's for, and a text's example. */
export interface PropertyDeclaration {
  description: string;
  label: string;
  placeholder?: string;
}

/**
 * The property types a ruleset's rules read, which keep its entities' fields: those each entity type declares, the
 * values each takes when they're a closed list, and the entity kind one's value names by its id.
 */
export interface PropertyTypesProvider {
  /** The types declared on an entity type (on every one, without one), in the order its stat block shows them. */
  getDeclarations(entityType?: PropertyEntityType): Readonly<Record<string, PropertyDeclaration>>;
  /** The entity kind a property type's value names by its id (a class's bonus spell ability: an ability), if any. */
  getReferencedEntityType(type: string): Exclude<keyof ViewEntities, "klass_levels"> | null;
  /** The values a property type takes, in their order, when they're a closed list: none for a free one. */
  getValues(type: string): readonly string[] | null;
}
