import type { StandaloneKind } from "@/engine/core/view/index.ts";
import type {
  Fields as DeclaredFields,
  FieldSpec as DeclaredFieldSpec,
  FieldValues as DeclaredFieldValues,
  LeafSpec as DeclaredLeafSpec,
} from "@/shared/customization/fields.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

/**
 * An entity's fields, by name, in the order its form shows them, as `shared/customization/fields.ts` declares them: each
 * reference naming a kind of the view.
 */
export type Fields = DeclaredFields<StandaloneKind>;

/** A field an entity keeps in its stored values, as its ruleset's vocabulary declares it: a reference names a view's kind. */
export type FieldSpec = DeclaredFieldSpec<StandaloneKind>;

/** The values an entity's fields read, by name: each by its kind, a choice one of its values. */
export type FieldValues<S extends Fields> = DeclaredFieldValues<S>;

/** A field of a spec that isn't a group: a value of its own, which its stored field keeps. */
export type LeafSpec = DeclaredLeafSpec<StandaloneKind>;

/** No fields: a kind whose entities hold none of their own (`FieldCodec.NONE`). */
export type NoFields = Record<never, never>;

/** A flag's values, true first: the order a stat block lists them in. */
const FLAG_VALUES = ["true", "false"] as const;

/** What every kind of field shares: when one counts, the leaves a spec's fields hold, and a leaf's closed values. */
export default class Field {
  /**
   * The values a leaf takes, in their order, when they're a closed list (a flag's, true and false; a choice's, a list's
   * or a text's), as text: none for a free one.
   */
  static closedValuesOf(leaf: LeafSpec): readonly string[] | null {
    if (leaf.kind === "flag") return FLAG_VALUES;
    return "values" in leaf && leaf.values ? leaf.values : null;
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

  /** The fields that hold a value of their own, a group's too, in the spec's order. */
  static leavesOf(fields: Fields): LeafSpec[] {
    return Object.values(fields).flatMap((field) => (field.kind === "group" ? Field.leavesOf(field.fields) : [field]));
  }
}
