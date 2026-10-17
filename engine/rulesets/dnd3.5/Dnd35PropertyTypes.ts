import { FieldPropertyTypes } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/**
 * The property types the 3.5 rules read: those its entities' fields are stored in, as its vocabulary declares them
 * (`ENTITY_FIELDS`), by the entity they're on (each with its field's label and what it's for), and the values each
 * takes when they're a closed list.
 */
export default class Dnd35PropertyTypes extends FieldPropertyTypes {
  constructor() {
    super(ENTITY_FIELDS);
  }

  /** The property types every 3.5 ruleset reads, which `valuesOf` answers from. */
  private static readonly SHARED = new Dnd35PropertyTypes();

  /** The values a property type takes, in their order, when they're a closed list: none for a free-text type. */
  static valuesOf(type: string): readonly string[] | null {
    return Dnd35PropertyTypes.SHARED.getValues(type);
  }
}
