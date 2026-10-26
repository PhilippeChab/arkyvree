import type { FieldValue, OwnerFields } from "@/engine/core/module/index.ts";

/**
 * What a write sets of an owner's values (a codec's, a save's): each field it names by its declared name, its values
 * replacing the owner's (none clears it), and each link role it names, the entity it names replacing the owner's (null
 * clears it).
 */
export interface FieldsWrite {
  fields: Readonly<Record<string, readonly FieldValue[]>>;
  links: Readonly<Record<string, string | null>>;
}

/**
 * An owner's values as stored, which its fields are read off (an entity's record, a ruleset's Settings): its fields by
 * their declared names (`OwnerFields`), and its single links' targets, by role (a class's bonus spell ability).
 */
export interface StoredValues {
  fields: OwnerFields;
  links: Readonly<Partial<Record<string, string>>>;
}

/** What every owner's values share: none, a field's values, and an owner's own fields over those it inherits. */
export default class OwnerValues {
  /** No values: an owner's that holds none. */
  static readonly NONE: StoredValues = { fields: {}, links: {} };

  /**
   * An owner's own fields over those it inherits (`base`: an item's template's): each field of the base it holds none
   * of (of `inherited`), the base's first, then its own, in their orders.
   */
  static inherit(own: OwnerFields, base: OwnerFields, inherited: ReadonlySet<string>): OwnerFields {
    const fields: Record<string, OwnerFields[string]> = {};
    for (const [field, values] of Object.entries(base))
      if (!(field in own) && inherited.has(field)) fields[field] = values;

    return Object.assign(fields, own);
  }

  /** A field's values as its owner holds them (`fields`): none, its one, or a set's, in their order. */
  static valuesOf(fields: OwnerFields, field: string): readonly FieldValue[] {
    const held = fields[field];
    if (held === undefined) return [];
    return Array.isArray(held) ? held : [held as FieldValue];
  }
}
