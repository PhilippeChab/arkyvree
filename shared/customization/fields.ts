/**
 * An entity's fields as a ruleset's vocabulary declares them (`FieldSpec`, data written `as const`), and the values
 * they read (`FieldValues`): what the engine stores, merges, reads and writes them by (its codecs, its storage), and
 * what a ruleset's content types its seeds' fields with, as stored (`StoredFieldValues`). A reference names an entity
 * kind (`K`), which the engine binds to its view's kinds. And how a sheet shows them: a field's name as a label
 * (`formatFieldName`), its values joined in their options' order (`formatFieldValues`).
 */

import { sortByOrder } from "@/shared/sortByOrder.ts";

import type { DeclaredProgression, ProgressionValue } from "./progression.ts";

/**
 * What every field declares: when it counts (`when`), and where its form shows it: in which groups (`shownIn`), and on
 * which of the form's values (`shownWhen`).
 */
interface FieldBase {
  /**
   * The groups at its level its form shows it in, among their own fields, rather than on its own (an armor's or a
   * shield's max Dex bonus in its Armor or Shield section): its value stays its own, read and written at its level.
   */
  shownIn?: readonly string[];
  /** While every one holds, its form shows it (an item's weapon, while it's a weapon): none, always */
  shownWhen?: readonly ShownWhen[];
  when?: FieldCondition;
}

/**
 * What a field with a value of its own declares: its label and what it's for, and where its owner's form shows it
 * (`placement`).
 */
interface LeafBase extends FieldBase {
  description: string;
  label: string;
  /**
   * Where its owner's form shows it: beside its name and description, before its other fields (a class's hit die, an
   * item's cost, a skill's ability). None: among its other fields, its lists of links after them
   */
  placement?: "beside-name";
}

/**
 * When a form shows a field: while the value its owner's form holds at a stored field (`field`, its owner's: 3.5's
 * `ITEM_TYPE`) is one of `values`, or, `except`, isn't.
 */
interface ShownWhen {
  except?: true;
  field: string;
  values: readonly (boolean | string)[];
}

/**
 * What a field its owner stores declares past a leaf's: the stored field that keeps it, how its owner's sibling copies
 * merge it (`merge`), the role of the link its owner reads it off another through when it holds none (`inherits`: an
 * item's, its template's `madeFrom`), and whether its owner's form takes it (`form`).
 */
interface StoredLeafBase extends LeafBase {
  field: string;
  /**
   * Whether its owner's form takes it: never (`hidden`: its kind's rules set it, a feat's flags), or with no input of
   * its own (`unshown`: its page gives it, an item's template flag, which its kind's copies name). None: its form shows
   * and takes it
   */
  form?: "hidden" | "unshown";
  /** The role of its owner's single link to the entity it reads it off when it holds none: none, its own alone */
  inherits?: string;
  /**
   * Whether its owner keeps the fields its form shows among its others (not beside its name) only while it holds a
   * value of this one (a spell's school): none of their rows otherwise, whoever writes them. None: they're kept
   * whatever it holds
   */
  keepsForm?: true;
  /**
   * Whether its values are read kind-wide, each with the owners that hold it (`RulesetData.kindValues`): the groupings
   * its kind's values name (a weapon's type, a feat's family, a spell's school) and their target paths' labels. None:
   * its owner's alone
   */
  kindWide?: true;
  merge: Merge;
}

/**
 * A leaf its owner always holds a value of: one always written (`write`) with a default (a flag's, false without one),
 * which its storage writes a new owner that gives none, and an owner a write clears it on.
 */
type HeldLeafOf<L> = L extends { write: "always" } ? (L extends FlagSpec | { default: unknown } ? L : never) : never;

/** A stored field's value as its storage holds it: its kind's, a text one of its values where they're a closed list. */
type HeldValueOf<F> = F extends TextSpec & { values: readonly (infer V extends string)[] } ? V : StoredValueOf<F>;

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
            : F extends { default: string }
              ? string
              : string | null;

/** A field's leaves: a group's own fields, or the field itself. */
type LeavesOf<F> = F extends GroupSpec ? F["fields"][keyof F["fields"]] : F;

/** The stored field that keeps a leaf. */
type StoredFieldOf<L> = L extends { field: infer F extends string } ? F : never;

/**
 * The leaves of a spec its owner's fields keep (a group's included): each one but a reference and a list of links,
 * which are links', and a progression, which a ruleset's Settings alone hold.
 */
type StoredLeafOf<S extends Fields> = Exclude<LeavesOf<S[keyof S]>, LinksSpec | ProgressionSpec | RefSpec>;

/** A stored field's value, of its kind: a flag, a number, one of a choice's values, a list's values, a text. */
type StoredValueOf<F> = F extends FlagSpec
  ? boolean
  : F extends NumberSpec
    ? number
    : F extends ChoiceSpec
      ? F["values"][number]
      : F extends ListSpec
        ? string[]
        : string;

/**
 * A field's value: by its kind (`KindValueOf`), unknown for any field (a kind's fields read without their spec, whatever
 * kinds its references name).
 */
type ValueOf<F extends FieldSpec> = [FieldSpec<never>] extends [F] ? unknown : KindValueOf<F>;

/**
 * One of `values`, its field's first value; none without one, or when it's another value, which a form may leave it at
 * unless it's `required`.
 */
export interface ChoiceSpec extends StoredLeafBase {
  kind: "choice";
  required?: true;
  values: readonly string[];
}

/**
 * When a field counts: while another of the entity's fields (`field`, at the same level) holds one of `values`. The
 * codec reads it and takes it from a form only then, and every write stores it only then (`FieldWrites`), its default
 * otherwise (a skill's armor check multiplier, while armor weighs on it).
 */
export interface FieldCondition {
  field: string;
  values: readonly (boolean | string)[];
}

/**
 * True once one of its values is; without any, its `default` (false without one), or none when it tells its absence
 * apart (`absent: null`, an item's: a false value is written and read too). Written when it's true, or always
 * (`write`: false too, its default for none).
 */
export interface FlagSpec extends StoredLeafBase {
  absent?: null;
  default?: boolean;
  kind: "flag";
  write?: "always";
}

/** Fields of their own, read off the same values (an item's weapon, its armor), which a form shows under `label`. */
export interface GroupSpec<K extends string = string> extends FieldBase {
  fields: Fields<K>;
  kind: "group";
  label: string;
}

/**
 * Its owner's links of a role (`role`), each to an entity of a kind (`references`: 3.5's `aptitudes`), which its form
 * edits as a list (`entries`): each its target alone (none), at a tier of its own (`tier`, from `min` to `max`, none
 * too: a spell's spell level on its spell lists), with an amount (`amount`, from `min` to `max`: a class level's base
 * bonus to a save), or through an entity of the kind `via` names, free or not (`grant`: a class level's feats, each
 * through its pool). A new entity's empty list is refused, saying `required`, when it has one. Its values are its
 * links', which its owner's answer holds among its links: no field keeps them.
 */
export interface LinksSpec<K extends string = string> extends LeafBase {
  entries?: "amount" | "grant" | "tier";
  kind: "links";
  max?: number;
  min?: number;
  references: K;
  required?: string;
  role: string;
  via?: K;
}

/** Every value of its field, in their order: a set, among `values` when they're a closed list. */
export interface ListSpec extends StoredLeafBase {
  kind: "list";
  /** An example of one, when it takes any. */
  placeholder?: string;
  values?: readonly string[];
}

/**
 * A field's input on a form that meets its conditions (`shownWhen`), in place of its own, which shows otherwise: of
 * some of its values alone (`values`), said what it's for (`description`), a value required (`required`). A form's
 * presentation alone: what a save takes stays its field's.
 */
export interface NarrowedInput {
  description: string;
  required?: true;
  shownWhen: readonly ShownWhen[];
  values: readonly string[];
}

/**
 * A number, its field's first value that's one in its bounds; its default without one (none without a `default`, which
 * a form may leave it at; one with a default it never clears): a whole number, or a decimal kept to `scale` places (an
 * item's cost and weight, to the hundredth), one of `values` when they're a closed list (a hit die's), each named by
 * its label (`labels`, by position: 8's "d8"), in its `unit` ("feet"). Written unless it's its default, or always
 * (`write`).
 */
export interface NumberSpec extends StoredLeafBase {
  default?: number;
  kind: "number";
  labels?: readonly string[];
  max?: number;
  min?: number;
  scale?: number;
  unit?: string;
  values?: readonly number[];
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
 * one, which a form may leave it at unless it's `required`. One of its owner's own kind may be its template, of its
 * owner's type (`typeField`, the stored field its type is at: an item's template, of its `ITEM_TYPE`), which its form
 * offers those of alone.
 */
export interface RefSpec<K extends string = string> extends LeafBase {
  kind: "ref";
  references: K;
  required?: boolean;
  role: string;
  typeField?: string;
}

/**
 * A text, its field's first value, among `values` when they're a closed list: its `default` without one (none without
 * a default), or written empty; one a form never leaves at none when it's `required`, a new one's its default when its
 * form gives none. Written unless it's empty, or always (`write`: its default for none). Its form may show it, on other
 * conditions, as an input of some of its values alone (`narrowed`: an item template's type, one a template can be of).
 */
export interface TextSpec extends StoredLeafBase {
  default?: string;
  kind: "text";
  narrowed?: NarrowedInput;
  /** An example of one, when it takes any. */
  placeholder?: string;
  required?: true;
  values?: readonly string[];
  write?: "always";
}

/** An entity's fields, by name, in the order its form shows them, its references naming kinds of `K`. */
export type Fields<K extends string = string> = Readonly<Record<string, FieldSpec<K>>>;

/**
 * A field an entity holds, as its ruleset's vocabulary declares it (data, written `as const`, which types its value:
 * `FieldValues`): its kind, the stored field that keeps it (a reference's single link), its label and what it's for,
 * how its values read and how its owner's copies merge them, when it counts and where its form shows it.
 */
export type FieldSpec<K extends string = string> =
  | ChoiceSpec
  | FlagSpec
  | GroupSpec<K>
  | LinksSpec<K>
  | ListSpec
  | NumberSpec
  | ProgressionSpec
  | RefSpec<K>
  | TextSpec;

/**
 * The values an entity's fields read, by name: each by its kind (`ValueOf`), a choice one of its values; none of a
 * list of links, whose values are its links'.
 */
export type FieldValues<S extends Fields> = {
  -readonly [K in keyof S as S[K] extends LinksSpec ? never : K]: ValueOf<S[K]>;
};

/**
 * An owner's fields as its storage holds them, by the stored field that keeps each (a group's leaves among them), each
 * a value of its kind: those it always holds a value of present (`HeldLeafOf`: an item's slot, a class's hit die), the
 * others optional. What a view's entity types its fields by.
 */
export type HeldFieldValues<S extends Fields> = StoredFieldValues<S> & {
  [F in StoredFieldOf<HeldLeafOf<StoredLeafOf<S>>>]: HeldValueOf<Extract<StoredLeafOf<S>, { field: F }>>;
};

/** A field of a spec that isn't a group: a value of its own, which its stored field keeps. */
export type LeafSpec<K extends string = string> = Exclude<FieldSpec<K>, GroupSpec<K>>;

/**
 * How an owner's sibling copies (one entity copied by two books, a book's reprint of another's) merge a field or a
 * single link into the winning copy's: the winner's value or none (`winner`), the winner's else the first sibling's
 * that holds one (`fallback`), or every copy's values (`union`, a set's).
 */
export type Merge = "fallback" | "union" | "winner";

/**
 * Some of an entity's fields as stored, by the stored field that keeps each (a group's leaves among them), each a value
 * of its kind: what a ruleset's content seeds an entity with, which the seeders write as it is.
 */
export type StoredFieldValues<S extends Fields> = {
  [F in StoredFieldOf<StoredLeafOf<S>>]?: StoredValueOf<Extract<StoredLeafOf<S>, { field: F }>>;
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
