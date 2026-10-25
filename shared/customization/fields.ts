/**
 * An entity's fields as a ruleset's vocabulary declares them (`FieldSpec`, data written `as const`), and the values
 * they read (`FieldValues`): what the engine reads and writes them by (its codecs), and what a ruleset's content types
 * its seeds' fields with (`PartialFieldValues`). A reference names an entity kind (`K`), which the engine binds to its
 * view's kinds. And how a sheet shows them: a field's name as a label (`formatFieldName`), its values joined in their
 * options' order (`formatFieldValues`).
 */

import { sortByOrder } from "@/shared/sortByOrder.ts";

import type { DeclaredProgression, ProgressionValue } from "./progression.ts";

/** What every field declares: when it counts (`when`), and where its form shows it (`shownIn`). */
interface FieldBase {
  /**
   * The groups at its level its form shows it in, among their own fields, rather than on its own (an armor's or a
   * shield's max Dex bonus in its Armor or Shield section): its value stays its own, read and written at its level.
   */
  shownIn?: readonly string[];
  when?: FieldCondition;
}

/** What a field with a value of its own declares: its label and what it's for. */
interface LeafBase extends FieldBase {
  description: string;
  label: string;
}

/** What a field its owner's stored values keep declares past a leaf's: the stored field that keeps them. */
interface StoredLeafBase extends LeafBase {
  field: string;
}

/** A field's value, by its kind (a group's, its own fields'). */
type KindValueOf<F extends FieldSpec> = F extends GroupSpec
  ? FieldValues<F["fields"]>
  : F extends FlagSpec
    ? "absent" extends keyof F
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

/**
 * A field's value: by its kind (`KindValueOf`), unknown for any field (a kind's fields read without their spec, whatever
 * kinds its references name).
 */
type ValueOf<F extends FieldSpec> = [FieldSpec<never>] extends [F] ? unknown : KindValueOf<F>;

/** One of `values`, its field's first value; none without one, or when it's another value. */
export interface ChoiceSpec extends StoredLeafBase {
  kind: "choice";
  values: readonly string[];
}

/**
 * True once one of its values is; without any, false, or none when it tells its absence apart (`absent: null`, an
 * item's: a false value is written and read too).
 */
export interface FlagSpec extends StoredLeafBase {
  absent?: null;
  kind: "flag";
}

/** Fields of their own, read off the same values (an item's weapon, its armor), which a form shows under `label`. */
export interface GroupSpec<K extends string = string> extends FieldBase {
  fields: Fields<K>;
  kind: "group";
  label: string;
}

/** Every value of its field, in their order: a set, among `values` when they're a closed list. */
export interface ListSpec extends StoredLeafBase {
  kind: "list";
  /** An example of one, when it takes any. */
  placeholder?: string;
  values?: readonly string[];
}

/**
 * A whole number, its field's first value that's one in its bounds; its default without one (none without a
 * `default`). Written unless it's its default, or always (`write`).
 */
export interface NumberSpec extends StoredLeafBase {
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
export interface ProgressionSpec extends StoredLeafBase {
  default: DeclaredProgression;
  kind: "progression";
  levels: number;
  max: number;
}

/**
 * An entity's id, the one its owner's link of `role` names (`references`: the kind it names, `abilities`): none without
 * one, which a form may leave it at unless it's `required`.
 */
export interface RefSpec<K extends string = string> extends LeafBase {
  kind: "ref";
  references: K;
  required?: boolean;
  role: string;
}

/** A text, its field's first value, among `values` when they're a closed list: none without one, or written empty. */
export interface TextSpec extends StoredLeafBase {
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

/** An entity's fields, by name, in the order its form shows them, its references naming kinds of `K`. */
export type Fields<K extends string = string> = Readonly<Record<string, FieldSpec<K>>>;

/**
 * A field an entity keeps in its stored values, as its ruleset's vocabulary declares it (data, written `as const`, which
 * types its value: `FieldValues`): its kind, the stored field that keeps it (a reference's link), its label and what
 * it's for, how its values read, when it counts and where its form shows it.
 */
export type FieldSpec<K extends string = string> =
  | ChoiceSpec
  | FlagSpec
  | GroupSpec<K>
  | ListSpec
  | NumberSpec
  | ProgressionSpec
  | RefSpec<K>
  | TextSpec;

/** The values an entity's fields read, by name: each by its kind (`ValueOf`), a choice one of its values. */
export type FieldValues<S extends Fields> = { -readonly [K in keyof S]: ValueOf<S[K]> };

/** A field of a spec that isn't a group: a value of its own, which its stored field keeps. */
export type LeafSpec<K extends string = string> = Exclude<FieldSpec<K>, GroupSpec<K>>;

/**
 * Some of the values an entity's fields read (`FieldValues`), by name, a group's some of its own: what a seed gives of
 * its entity's fields, the others its entity doesn't keep (a group it gives is written whole, its others cleared).
 */
export type PartialFieldValues<S extends Fields> = {
  -readonly [K in keyof S]?: S[K] extends GroupSpec ? PartialFieldValues<S[K]["fields"]> : ValueOf<S[K]>;
};

/** An UPPER_SNAKE_CASE field's name as a label ("SPELL_SCHOOL" → "Spell School"). */
export function formatFieldName(field: string) {
  return field
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Each field's values joined in its options' order (`optionsOf`, a ruleset's closed values for the field: a spell's
 * components as V, S, M…, its descriptors alphabetical, as the books print them), those no option names after them as
 * given: an entity's values as a sheet lists them, those a modifier adds included.
 */
export function formatFieldValues(
  valuesByField: Record<string, string[]>,
  optionsOf: (field: string) => readonly string[] | null,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(valuesByField).map(([field, values]) => [
      field,
      sortByOrder(values, optionsOf(field) ?? [], (value) => value).join(", "),
    ]),
  );
}
