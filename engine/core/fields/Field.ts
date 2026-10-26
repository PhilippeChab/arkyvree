import type { FieldValue, ValueKind } from "@/engine/core/module/index.ts";
import type { StandaloneKind } from "@/engine/core/view/index.ts";
import type {
  Fields as DeclaredFields,
  FieldSpec as DeclaredFieldSpec,
  FieldValues as DeclaredFieldValues,
  LeafSpec as DeclaredLeafSpec,
  GroupSpec,
  NumberSpec,
} from "@/shared/customization/fields.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import Decimals from "./Decimals.ts";

/**
 * What a field's write rule reads of it (`Field.writtenValues`): its kind, a stored leaf's or, for a field no spec
 * declares (a character's), its stored value's, and what a leaf adds: its default, whether it tells a false flag from
 * none (`absent`), whether it's always written (`write`).
 */
export interface WrittenKind {
  absent?: null;
  default?: unknown;
  kind: StoredLeaf["kind"];
  write?: "always";
}

/**
 * An entity's fields, by name, in the order its form shows them, as `shared/customization/fields.ts` declares them: each
 * reference naming a kind of the view.
 */
export type Fields = DeclaredFields<StandaloneKind>;

/** A field an entity holds, as its ruleset's vocabulary declares it: a reference names a view's kind. */
export type FieldSpec = DeclaredFieldSpec<StandaloneKind>;

/** The values an entity's fields read, by name: each by its kind, a choice one of its values. */
export type FieldValues<S extends Fields> = DeclaredFieldValues<S>;

/** A field of a spec that isn't a group: a value of its own, which its stored field keeps (a reference's, a link). */
export type LeafSpec = DeclaredLeafSpec<StandaloneKind>;

/** No fields: a kind whose entities hold none of their own (`FieldCodec.NONE`). */
export type NoFields = Record<never, never>;

/** Some of the values an entity's fields read, by name, a group's some of its own: what a form gives of them. */
export type PartialFieldValues<S extends Fields> = {
  -readonly [K in keyof S]?: S[K] extends GroupSpec ? PartialFieldValues<S[K]["fields"]> : FieldValues<S>[K];
};

/** A leaf its owner's fields keep: any but a reference, whose value is a single link's. */
export type StoredLeaf = Exclude<LeafSpec, { kind: "ref" }>;

/** A flag's values, true first: the order a stat block lists them in. */
const FLAG_VALUES = ["true", "false"] as const;

/**
 * What every kind of field shares: when one counts, the leaves a spec's fields hold, a leaf's closed values, and how
 * its owner stores it.
 */
export default class Field {
  /**
   * The bounds of a number field's values: its declared ones, within those it holds exactly to its places
   * (`Decimals.largest`), which every number field takes alike.
   */
  static boundsOf(leaf: Pick<NumberSpec, "max" | "min" | "scale">): { max: number; min: number } {
    const largest = Decimals.largest(leaf.scale);
    return { max: Math.min(leaf.max ?? largest, largest), min: Math.max(leaf.min ?? -largest, -largest) };
  }

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

  /**
   * The fields at a spec's level that keep the fields its form shows (`keepsForm`: a spell's school), by name: a
   * group's own aren't read, so every writer reads the same ones (the codec by name, the write path by stored field).
   */
  static keepersOf(fields: Fields): [string, StoredLeaf][] {
    return Object.entries(fields).flatMap(([key, field]): [string, StoredLeaf][] =>
      field.kind !== "group" && field.kind !== "ref" && field.keepsForm ? [[key, field]] : [],
    );
  }

  /** The fields that hold a value of their own, a group's too, in the spec's order. */
  static leavesOf(fields: Fields): LeafSpec[] {
    return Object.values(fields).flatMap((field) => (field.kind === "group" ? Field.leavesOf(field.fields) : [field]));
  }

  /**
   * How a leaf's values are stored, by its kind: the kind of value each is (a flag's, a number's, text), and whether
   * it's a set (a list's, a progression's). A kind this doesn't name fails to type-check, never stores as text.
   */
  static storedKindOf(leaf: StoredLeaf): { multiple: boolean; valueKind: ValueKind } {
    switch (leaf.kind) {
      case "flag":
      case "number":
        return { multiple: false, valueKind: leaf.kind };
      case "choice":
      case "text":
        return { multiple: false, valueKind: "text" };
      case "list":
      case "progression":
        return { multiple: true, valueKind: "text" };
      default: {
        const unknown: never = leaf;
        throw new Error(`No stored kind for the field ${JSON.stringify(unknown)}`);
      }
    }
  }

  /** The leaves its owner's fields keep, a group's too, in the spec's order: a reference's value is a link's. */
  static storedLeavesOf(fields: Fields): StoredLeaf[] {
    return Field.leavesOf(fields).flatMap((leaf) => (leaf.kind === "ref" ? [] : [leaf]));
  }

  /**
   * What a leaf's value stores, as every write stores it, a seed's, a form's or an import's (`value`: a value of its
   * kind, a set's values, as stored; none or null, nothing): a set's values each once; a flag's when it's true, or when
   * the leaf tells a false one from none (`absent: null`) or is always written (`write`); a number unless it's its
   * default, or always; a text unless it's empty, its default then when always written; a choice's unless it's empty.
   * Several values of a single leaf are what they are: the write path refuses them. A field no spec declares (a
   * character's) is written by its stored kind alone (`WrittenKind`): no false flag, no empty text.
   */
  static writtenValues(leaf: WrittenKind, value: unknown): FieldValue[] {
    if (value === undefined || value === null) return [];
    const values = (Array.isArray(value) ? value : [value]) as FieldValue[];
    if (leaf.kind === "list" || leaf.kind === "progression") return [...new Set(values)];
    if (values.length !== 1) return values;
    const [one] = values;
    switch (leaf.kind) {
      case "flag":
        return leaf.absent === null || leaf.write === "always" || one === true ? [one] : [];
      case "number":
        return leaf.write === "always" || one !== leaf.default ? [one] : [];
      case "text": {
        const text = one === "" && leaf.write === "always" ? leaf.default : one;
        return text === "" || text === undefined ? [] : [text as FieldValue];
      }
      default:
        return one === "" ? [] : [one];
    }
  }
}
