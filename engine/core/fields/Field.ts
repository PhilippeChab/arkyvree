import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { DeclaredProgression, ProgressionValue } from "@/shared/customization/progression.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

/** What every field declares: when it counts (`when`), and where its form shows it (`shownIn`). */
interface FieldBase {
  /**
   * The groups at its level its form shows it in, among their own fields, rather than on its own (an armor's or a
   * shield's max Dex bonus in its Armor or Shield section): its value stays its own, read and written at its level.
   */
  shownIn?: readonly string[];
  when?: FieldCondition;
}

/** What a field with a value of its own declares: the property type that stores it, its label and what it's for. */
interface LeafBase extends FieldBase {
  description: string;
  label: string;
  type: string;
}

/** A field's value, by its kind (a group's, its own fields'). */
type KindValueOf<F extends FieldSpec> = F extends GroupSpec
  ? FieldValues<F["fields"]>
  : F extends FlagSpec
    ? F extends { absent: null }
      ? boolean | null
      : boolean
    : F extends NumberSpec
      ? F extends { default: number }
        ? number
        : number | null
      : F extends ChoiceSpec
        ? F["values"][number] | null
        : F extends ListSpec
          ? string[]
          : F extends ProgressionSpec
            ? ProgressionValue
            : string | null;

/** A field's value: by its kind (`KindValueOf`), unknown for any field (a kind's fields read without their spec). */
type ValueOf<F extends FieldSpec> = [FieldSpec] extends [F] ? unknown : KindValueOf<F>;

/** One of `values`, from its first row; none without one, or when its row holds another value. */
export interface ChoiceSpec extends LeafBase {
  kind: "choice";
  values: readonly string[];
}

/**
 * True once one of its rows says `"true"`; without any, false, or none when it tells its absence apart (`absent: null`,
 * an item's: a `"false"` row is written and read too).
 */
export interface FlagSpec extends LeafBase {
  absent?: null;
  kind: "flag";
}

/** Fields of their own, read off the same rows (an item's weapon, its armor), which a form shows under `label`. */
export interface GroupSpec extends FieldBase {
  fields: Fields;
  kind: "group";
  label: string;
}

/** Every row of its type, in their order: one row per value, among `values` when they're a closed list. */
export interface ListSpec extends LeafBase {
  kind: "list";
  /** An example of one, when it takes any. */
  placeholder?: string;
  values?: readonly string[];
}

/**
 * A whole number, from the first row that holds one in its bounds; its default without one (none without a
 * `default`). Written unless it's its default, or always (`write`).
 */
export interface NumberSpec extends LeafBase {
  default?: number;
  kind: "number";
  max?: number;
  min?: number;
  write?: "always";
}

/**
 * What levels give of something (a ruleset's feats, its ability increases): a row of its frequency (`every:3`) and one
 * per level it gives more at (`5:1`), up to level `levels`, a level giving at most `max` with its frequency's. They
 * stand for the whole together, so none more is the frequency's row alone: its default without any row. A field of its
 * own, never a group's: a group's fields hold plain values.
 */
export interface ProgressionSpec extends LeafBase {
  default: DeclaredProgression;
  kind: "progression";
  levels: number;
  max: number;
}

/**
 * An entity's id, from its first row (`references`: the kind it names, `abilities`): none without one, which a form
 * may leave it at unless it's `required`.
 */
export interface RefSpec extends LeafBase {
  kind: "ref";
  references: Exclude<keyof ViewEntities, "klass_levels">;
  required?: boolean;
}

/** A text, from its first row, among `values` when they're a closed list: none without one, none written when empty. */
export interface TextSpec extends LeafBase {
  kind: "text";
  /** An example of one, when it takes any. */
  placeholder?: string;
  values?: readonly string[];
}

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

/** An entity's fields, by name, in the order its form shows them. */
export type Fields = Readonly<Record<string, FieldSpec>>;

/**
 * A field an entity keeps in its properties, as its ruleset's vocabulary declares it (data, written `as const`, which
 * types its value: `FieldValues`): its kind, the property type that stores it, its label and what it's for, how its
 * rows read, when it counts and where its form shows it. A codec reads and writes it (`FieldCodec`).
 */
export type FieldSpec =
  | ChoiceSpec
  | FlagSpec
  | GroupSpec
  | ListSpec
  | NumberSpec
  | ProgressionSpec
  | RefSpec
  | TextSpec;

/** The values an entity's fields read, by name: each by its kind (`ValueOf`), a choice one of its values. */
export type FieldValues<S extends Fields> = { -readonly [K in keyof S]: ValueOf<S[K]> };

/** A field of a spec that isn't a group: a value of its own, which its property type keeps. */
export type LeafSpec = Exclude<FieldSpec, GroupSpec>;

/** No fields: a kind whose properties hold none of its own (`FieldCodec.NONE`). */
export type NoFields = Record<never, never>;

/** What every kind of field shares: when one counts, and the leaves a spec's fields hold. */
export default class Field {
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
