/**
 * The property types a ruleset's rules read, which keep its entities' fields: their order, as its stat blocks show
 * them, and the values each takes when they're a closed list.
 */
export interface PropertyTypesProvider {
  /** Every entity type's property types, each entity type's in the order its stat block shows them. */
  getTypes(): readonly string[];
  /** The values a property type takes, in their order, when they're a closed list: none for a free one. */
  getValues(type: string): readonly string[] | null;
}
