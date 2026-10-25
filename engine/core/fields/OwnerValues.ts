import type { FieldValue } from "@/engine/core/module/index.ts";

/**
 * What a save writes of an owner's stored values: each field it names by its declared name, its values replacing the
 * owner's (none clears it), and each link role it names, the entity it names replacing the owner's (null clears it).
 */
export interface FieldsWrite {
  fields: Readonly<Record<string, readonly FieldValue[]>>;
  links: Readonly<Record<string, string | null>>;
}

/**
 * An owner's stored values (an entity's past its kind's columns, a ruleset's Settings), as the view holds them: each
 * field's values by its declared name, a set's in its declared order (`DeclaredFields.orderValues`), and the entity each
 * link its fields read names, by the link's role (a class's bonus spell ability).
 */
export interface StoredValues {
  fields: Readonly<Record<string, readonly FieldValue[]>>;
  links: Readonly<Record<string, string>>;
}

/** What every owner's stored values share: none, an owner's own over those it inherits, and those a write leaves. */
export default class OwnerValues {
  /** No values: an owner's that holds none. */
  static readonly NONE: StoredValues = { fields: {}, links: {} };

  /**
   * An owner's values over those it inherits (`base`: an item's template's): each field of the base it holds none of
   * (of `inherited`, when given), the base's first, then its own, in their orders; its own links.
   */
  static inherit(own: StoredValues, base: StoredValues, inherited?: ReadonlySet<string>): StoredValues {
    const fields: Record<string, readonly FieldValue[]> = {};
    for (const [field, values] of Object.entries(base.fields))
      if (!(field in own.fields) && (!inherited || inherited.has(field))) fields[field] = values;

    return { fields: Object.assign(fields, own.fields), links: own.links };
  }

  /**
   * The values a write leaves an owner holding (`write`, a save's, which names every field and role its owner keeps):
   * each field it gives values, in their order, and each link it gives an entity.
   */
  static written(write: FieldsWrite): StoredValues {
    return {
      fields: Object.fromEntries(Object.entries(write.fields).filter(([, values]) => values.length > 0)),
      links: Object.fromEntries(
        Object.entries(write.links).flatMap(([role, toId]) => (toId === null ? [] : [[role, toId]])),
      ),
    };
  }
}
