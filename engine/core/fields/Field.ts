import { isOneOf } from "@/shared/isOneOf.ts";

/**
 * When a field counts:
 * - while another of the entity's fields (`field`, at the same level) holds one of `values`: the codec reads it, writes
 *   it and takes it from a form only then, and its default otherwise (a skill's armor check multiplier, while armor
 *   weighs on it);
 * - while one of the entity's columns (`column`) holds one of `values`, which only its form reads: it shows the field
 *   then (an item's weapon, while it's a weapon).
 */
export type FieldCondition =
  | { field: string; values: readonly (boolean | string)[] }
  | { column: string; values: readonly string[] };

/** An entity's fields, by name. */
export type Fields = Record<string, PropertyField<unknown>>;

/**
 * How a field is stored and read, when it counts (`when`, `FieldCondition`), and where its form shows it (`shownIn`: in
 * the groups at its level it names, which show it with their own fields, its value its own all the same):
 * - a flag is true once one of its rows says `"true"`; without any, it's false, or none when it tells its absence apart
 *   (`absent: null`, an item's: a `"false"` row is written and read too);
 * - a number, a text, a choice and a reference come from the first row of their type that holds one; a number in its
 *   bounds, a choice among its values;
 * - a list is every row of its type, in their order;
 * - a group holds fields of its own, read off the same rows, which its form shows under its `label`.
 */
export type FieldSpec = (
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
  | { fields: Fields; kind: "group"; label: string }
  | { kind: "list"; type: string }
  | { kind: "ref"; required: boolean; type: string }
  | { kind: "text"; type: string }
) & { shownIn?: readonly string[]; when?: FieldCondition };

/** The values an entity's fields read, by name. */
export type FieldValues<S extends Fields> = { [K in keyof S]: S[K] extends PropertyField<infer T> ? T : never };

/** No fields: a kind whose properties hold none of its own (`FieldCodec.NONE`). */
export type NoFields = Record<never, never>;

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

  /**
   * Whether a field counts beside the values of the fields at its level (`values`): always, unless its condition names
   * one of them (`FieldCondition`) whose value isn't one it counts on. A column's condition is its form's alone.
   */
  static counts(field: FieldSpec, values: Readonly<Record<string, unknown>>) {
    const { when } = field;
    if (!when || !("field" in when)) return true;
    return isOneOf(values[when.field], when.values);
  }

  /** True once one of its rows says so. */
  static flag(type: string): PropertyField<boolean>;
  /** True once one of its rows says so, false when they don't, none without a row: written `"false"` too. */
  static flag(type: string, options: { absent: null }): PropertyField<boolean | null>;
  static flag(type: string, options?: { absent: null }): PropertyField<boolean | null> {
    return { absent: options ? null : false, kind: "flag", type };
  }

  /** Fields of their own, read off the same rows (an item's weapon, its armor), which a form shows under `label`. */
  static group<S extends Fields>(label: string, fields: S): PropertyField<FieldValues<S>> {
    return { fields, kind: "group", label };
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

  /** An entity's id, from its first row: none without one, which a form may leave it at unless it's `required`. */
  static ref(type: string, options: { required?: boolean } = {}): PropertyField<string | null> {
    return { kind: "ref", required: options.required ?? false, type };
  }

  /**
   * A field its form shows in the groups at its level it names (`groups`), among their own fields, rather than on its
   * own: an armor's or a shield's max Dex bonus in its Armor or Shield section. Its value stays its own, read and
   * written at its level as any other field's.
   */
  static shownIn<F extends PropertyField<unknown>>(groups: readonly string[], field: F): F {
    return { ...field, shownIn: groups };
  }

  /** A text, from its first row: none without one, and none written when it's empty. */
  static text(type: string): PropertyField<string | null> {
    return { kind: "text", type };
  }

  /** A field that counts only on a condition (`FieldCondition`): another field's value, or a column's. */
  static when<F extends PropertyField<unknown>>(condition: FieldCondition, field: F): F {
    return { ...field, when: condition };
  }
}
