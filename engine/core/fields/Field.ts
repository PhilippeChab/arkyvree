/** An entity's fields, by name. */
export type Fields = Record<string, PropertyField<unknown>>;

/**
 * How a field is stored and read:
 * - a flag is true once one of its rows says `"true"`; without any, it's false, or none when it tells its absence apart
 *   (`absent: null`, an item's: a `"false"` row is written and read too);
 * - a number, a text, a choice and a reference come from the first row of their type that holds one; a number in its
 *   bounds, a choice among its values;
 * - a list is every row of its type, in their order;
 * - a group holds fields of its own, read off the same rows.
 */
export type FieldSpec =
  | { absent: false | null; kind: "flag"; type: string }
  | {
      default: number | null;
      kind: "number";
      max?: number;
      min?: number;
      type: string;
      write: "always" | "unlessDefault";
    }
  | { kind: "choice"; type: string; values: readonly string[] }
  | { fields: Fields; kind: "group" }
  | { kind: "list"; type: string }
  | { kind: "ref"; type: string }
  | { kind: "text"; type: string };

/** The values an entity's fields read, by name. */
export type FieldValues<S extends Fields> = { [K in keyof S]: S[K] extends PropertyField<infer T> ? T : never };

/**
 * A field an entity keeps in its properties, as data a codec reads and writes (`FieldCodec`): its kind, the property type
 * that stores it, and how its rows read, written with `Field`'s kinds. Typed by the value it reads (`T`), which only the
 * types carry.
 */
export type PropertyField<T> = FieldSpec & { readonly value?: T };

/** The kinds of field an entity keeps in its properties: what a codec's spec is written with. */
export default class Field {
  /** One of `values`, from its first row; none without one, or when its row holds another value. */
  static choice<V extends string>(type: string, values: readonly V[]): PropertyField<V | null> {
    return { kind: "choice", type, values };
  }

  /** True once one of its rows says so. */
  static flag(type: string): PropertyField<boolean>;
  /** True once one of its rows says so, false when they don't, none without a row: written `"false"` too. */
  static flag(type: string, options: { absent: null }): PropertyField<boolean | null>;
  static flag(type: string, options?: { absent: null }): PropertyField<boolean | null> {
    return { absent: options ? null : false, kind: "flag", type };
  }

  /** Fields of their own, read off the same rows (an item's weapon, its armor). */
  static group<S extends Fields>(fields: S): PropertyField<FieldValues<S>> {
    return { fields, kind: "group" };
  }

  /** Every row of its type, in their order: one row per value. */
  static list(type: string): PropertyField<string[]> {
    return { kind: "list", type };
  }

  /**
   * A whole number, from the first row that holds one in its bounds; its default without one. Written unless it's its
   * default, or always (`write`).
   */
  static number(
    type: string,
    options: { default: number; max?: number; min?: number; write?: "always" | "unlessDefault" },
  ): PropertyField<number>;
  /** A whole number, from the first row that holds one in its bounds; none without one. */
  static number(type: string, options?: { max?: number; min?: number }): PropertyField<number | null>;
  static number(
    type: string,
    options: { default?: number; max?: number; min?: number; write?: "always" | "unlessDefault" } = {},
  ): PropertyField<number | null> {
    const { max, min, write = "unlessDefault" } = options;
    return { default: options.default ?? null, kind: "number", max, min, type, write };
  }

  /** An entity's id, from its first row: none without one. */
  static ref(type: string): PropertyField<string | null> {
    return { kind: "ref", type };
  }

  /** A text, from its first row: none without one, and none written when it's empty. */
  static text(type: string): PropertyField<string | null> {
    return { kind: "text", type };
  }
}
