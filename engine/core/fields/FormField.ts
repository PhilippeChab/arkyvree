import type { ProgressionValue } from "@/shared/customization/progression.ts";

/** What every field of a form has. */
interface FormFieldBase {
  /**
   * The stored field its value is kept in, which an entity read holds among its `fields` and its form sends among its
   * own (3.5's item's cost, `ITEM_COST_GP`; a weapon's base damage, `WEAPON_BASE_DAMAGE`): none for one stored otherwise
   * (a link's, by its `role`).
   */
  field?: string;
  /** What it's for, as its ruleset says. */
  help: string;
  label: string;
  /**
   * Where its form shows it: beside its name and description, before its other fields (3.5's class's hit die, an item's
   * cost). None: among its other fields, a list of links after them
   */
  placement?: "beside-name";
  /**
   * The role of the link it's kept in, which its form sends among its `links` (a reference's, a template's, a list of
   * links'): none for a field's.
   */
  role?: string;
  /** While every one of them holds: none, always */
  shownWhen?: readonly ShownWhen[];
}

/**
 * When a form shows a field: while its value at `path` (where its form holds it: a field's, `fields.<field>`) is in
 * `values`, or, `except`, isn't.
 */
interface ShownWhen {
  except?: boolean;
  path: string;
  values: readonly (boolean | string)[];
}

/**
 * An amount an entity gives each entity of a kind (3.5's class level's base bonus to each of the ruleset's saves), from
 * `min` to `max`: its links of a `role`, each to an entity of its kind (`references`: 3.5's `saves`) with its
 * `amount`, which its form sends as `{ toId, amount }`. An entity read holds them among its `links`, by their `role`
 * (each its entity, `toId`, its name, `toName`, and its `amount`), which its form reads them from.
 */
export interface AmountsFormField extends FormFieldBase {
  input: "amounts";
  max: number;
  min: number;
  references: string;
  role: string;
}

/**
 * A choice of one value among its options (a select), or of several (`multiple`): each named by its label (`labels`,
 * by position: a hit die's 8 is "d8"), else as it is. One `required` offers no "None", and an empty form holds its
 * `default`.
 */
export interface ChoiceFormField extends FormFieldBase {
  default?: number | string;
  input: "choice";
  labels?: readonly string[];
  multiple: boolean;
  options: readonly (number | string)[];
  required?: boolean;
}

/**
 * A decimal, none too (an item's cost, its weight), at least `min` and at most `max`, in its `unit` ("gp"), which its
 * label names: kept to two places.
 */
export interface DecimalFormField extends FormFieldBase {
  input: "decimal";
  max?: number;
  min?: number;
  unit?: string;
}

/**
 * An entity's fields' values as its form sends them, by the stored field that keeps each (one it leaves out, none):
 * what its save reads.
 */
export interface EntityFieldValues {
  [field: string]: EntityFieldValue | undefined;
}

/**
 * An entity's form as a request carries it, as it stores it: its name and its description, its fields by the stored
 * field that keeps each (`fields`), its links by role (`links`: a single link's target, a list of links' entries), and
 * its place among its owner's (`position`, an owned entity's), which its kind reads by their descriptions
 * (`RulesetEntity`).
 */
export interface EntityForm {
  description?: string | null;
  fields?: EntityFieldValues;
  links?: EntityLinkValues;
  name?: string;
  position?: number;
}

/**
 * A link's entry as a form sends it: its target (`toId`), and its link's own columns (`viaId`, `tier`, `amount`,
 * `free`).
 */
export interface EntityLinkEntry {
  amount?: number;
  free?: boolean;
  tier?: number | null;
  toId: string;
  viaId?: string;
}

/**
 * An entity's links as its form sends them, by role (one it leaves out, kept): a single link's target, none (null)
 * clearing it, or a list of links' entries, which replaces its role's.
 */
export interface EntityLinkValues {
  [role: string]: EntityLinkEntry[] | string | null | undefined;
}

/** A yes or no: none too, when it's `nullable` (an item's, which none leaves to its template). */
export interface FlagFormField extends FormFieldBase {
  input: "flag";
  nullable: boolean;
}

/**
 * The entities an entity grants, each through the entity it's granted for (3.5's class level's feats, each through the
 * pool it's taken for): its links of a `role`, each to an entity of its kind (`references`: 3.5's `feats`) through one
 * of the pools its kind's list reads (`viaId`), and whether it's `free`, which its form sends as
 * `{ toId, viaId, free }`. An entity read holds them among its `links`, by their `role` and their kind (each its
 * entity, `toId`, its name and its description, `toName` and `toDescription`, the one it's through, `viaId`, and its
 * name, `viaName`, and whether it's free), which its form reads them from.
 */
export interface GrantsFormField extends FormFieldBase {
  input: "grants";
  references: string;
  role: string;
}

/** Fields of their own, which a form shows under their `label`. */
export interface GroupFormField {
  fields: FormField[];
  input: "group";
  label: string;
  shownWhen?: readonly ShownWhen[];
}

/**
 * Links to entities of a list, of its kind (`references`: 3.5's `aptitudes`), each with a tier of its own, none too
 * (3.5's spell's spell lists, each at its spell level): from `min` to `max`, which its form sends as `{ toId, tier }`.
 * A new entity's empty list is refused, saying `required`, when it has one. An entity read holds them among its
 * `links`, by their `role` (each its list, `toId`, its name, `toName`, and its tier), which its form reads them from.
 */
export interface LeveledLinksFormField extends FormFieldBase {
  input: "leveledLinks";
  max: number;
  min: number;
  references: string;
  required?: string;
  role: string;
}

/**
 * Links to entities of a list, of its kind (`references`: 3.5's `aptitudes`), none too (3.5's feat's pools), which its
 * form sends as `{ toId }`. A new entity's empty list is refused, saying `required`, when it has one. An entity read
 * holds them among its `links`, by their `role` (each its list, `toId`, and its name, `toName`), which its form reads
 * them from.
 */
export interface LinksFormField extends FormFieldBase {
  input: "links";
  references: string;
  required?: string;
  role: string;
}

/** A whole number in its bounds, in its `unit` ("feet"), which its label names: none, when it has no `default`. */
export interface NumberFormField extends FormFieldBase {
  default: number | null;
  input: "number";
  max?: number;
  min?: number;
  unit?: string;
}

/**
 * What levels give of something (`ProgressionValue`): a frequency, and more at the levels it names, each up to level
 * `levels` and giving at most `max` with its frequency's; its `default` without one of its own.
 */
export interface ProgressionFormField extends FormFieldBase {
  default: ProgressionValue;
  input: "progression";
  levels: number;
  max: number;
}

/**
 * An entity of the ruleset, by its id (`references`: its kind, `abilities`): none too, unless it's `required`. It's its
 * entity's single link of a `role`, which an entity read holds among its `links` (its target, `toId`).
 */
export interface RefFormField extends FormFieldBase {
  input: "ref";
  references: string;
  required: boolean;
  role: string;
}

/**
 * The template an item is made from, by its id: one of its own type (`typeField`, the stored field whose value its
 * templates are of), whose fields an item starts from; none too. A change of its type empties it. It's its entity's
 * single link of a `role`, which an entity read holds among its `links` (its target, `toId`).
 */
export interface TemplateFormField extends FormFieldBase {
  input: "template";
  role: string;
  typeField: string;
}

/**
 * A free text, or several (`multiple`), with an example of one (`placeholder`): none too, when it's `nullable` (an
 * empty one, none), else an empty one (a language's type).
 */
export interface TextFormField extends FormFieldBase {
  input: "text";
  multiple: boolean;
  nullable: boolean;
  placeholder?: string;
}

/** A field's value as a form sends it: a flag's, a number's, a text's or a choice's, a list's, a progression's; null none. */
export type EntityFieldValue = boolean | number | string | string[] | null | ProgressionValue;

/**
 * A field of an entity's form, as its ruleset declares it (`FieldCodec.describe`): its label, what it's for, and the
 * input it takes, each with what it needs (a choice's options, a number's bounds, a progression's default and
 * bounds, a reference's kind).
 */
export type FormField =
  | AmountsFormField
  | ChoiceFormField
  | DecimalFormField
  | FlagFormField
  | GrantsFormField
  | GroupFormField
  | LeveledLinksFormField
  | LinksFormField
  | NumberFormField
  | ProgressionFormField
  | RefFormField
  | TemplateFormField
  | TextFormField;
