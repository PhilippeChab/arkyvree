import { FieldPropertyTypes } from "@/engine/core/fields/index.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/properties/index.ts";

/**
 * The property types the 3.5 entities' fields are stored in, as its vocabulary declares them (`ENTITY_FIELDS`): their
 * order, as a stat block shows them, and the values each takes when they're a closed list.
 */
export default class Dnd35PropertyTypes extends FieldPropertyTypes {
  constructor() {
    super(ENTITY_FIELDS);
  }

  /** The property types every 3.5 ruleset reads: its module hands them out, and `valuesOf` answers from them. */
  static readonly SHARED = new Dnd35PropertyTypes();

  /** The values a property type takes, in their order, when they're a closed list: none for a free-text type. */
  static valuesOf(type: string): readonly string[] | null {
    return Dnd35PropertyTypes.SHARED.getValues(type);
  }
}
