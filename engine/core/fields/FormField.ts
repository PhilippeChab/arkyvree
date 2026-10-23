import type { ProgressionValue } from "@/shared/customization/progression.ts";

/** What every field of a form has. */
interface FormFieldBase {
  /** What it's for, as its ruleset says. */
  help: string;
  /**
   * Where its value goes: a field's, in the form's fields, its name under its group's (`weapon.damage`); a column's, in
   * the form itself (`hd`, `costGp`).
   */
  key: string;
  label: string;
  /** While every one of them holds: none, always */
  shownWhen?: readonly ShownWhen[];
}

/**
 * When a form shows a field: while its value at `path` (a field's, `fields.<name>`, or a column's) is in `values`, or,
 * `except`, isn't.
 */
interface ShownWhen {
  except?: boolean;
  path: string;
  values: readonly (boolean | string)[];
}

/**
 * A pool's links, each with a level of its own, none too (a spell's spell lists, each at its spell level): from `min`
 * to `max`, and at least one when it's `required` on a new entity. An entity read holds them at `links` (each link its
 * aptitude, `aptitudesInRule`, and its level), which its form reads them from.
 */
export interface AptitudeLevelsFormField extends FormFieldBase {
  input: "aptitudeLevels";
  links?: string;
  max: number;
  min: number;
  required: boolean;
}

/**
 * A pool's links (a feat's feat pools), none too: at least one when it's `required` on a new entity. An entity read
 * holds them at `links` (each link its aptitude, `aptitudesInRule`), which its form reads them from.
 */
export interface AptitudesFormField extends FormFieldBase {
  input: "aptitudes";
  links?: string;
  required: boolean;
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
 * label names.
 */
export interface DecimalFormField extends FormFieldBase {
  input: "decimal";
  max?: number;
  min?: number;
  unit?: string;
}

/** A group's fields' values, by name. */
export interface EntityFieldGroupValues {
  [key: string]: boolean | number | string | string[] | null;
}

/** An entity's fields' values as its form sends them, by name (one it leaves out, none): what its save reads. */
export interface EntityFieldValues {
  [key: string]: EntityFieldValue | undefined;
}

/**
 * An entity's form as a request carries it: its name, its description and its fields, which its route reads, and its
 * columns, and what else its kind reads, by key (`RulesetEntity`, which reads them by their descriptions).
 */
export interface EntityForm {
  [key: string]: unknown;
  description?: string | null;
  fields?: EntityFieldValues;
  name?: string;
}

/** A yes or no: none too, when it's `nullable` (an item's, which none leaves to its template). */
export interface FlagFormField extends FormFieldBase {
  input: "flag";
  nullable: boolean;
}

/** The feats a class level grants, each through an aptitude (a feat pool) it's taken for. */
export interface GrantedFeatsFormField extends FormFieldBase {
  input: "grantedFeats";
}

/** Fields of their own, which a form shows under their `label`. */
export interface GroupFormField {
  fields: FormField[];
  input: "group";
  /** Where its fields' values go in the form's fields. */
  key: string;
  label: string;
  shownWhen?: readonly ShownWhen[];
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

/** An entity of the ruleset, by its id (`references`: its kind, `abilities`): none too, unless it's `required`. */
export interface RefFormField extends FormFieldBase {
  input: "ref";
  references: string;
  required: boolean;
}

/** A base bonus a class level gives each of the ruleset's saves, from `min` to `max`. */
export interface SaveBasesFormField extends FormFieldBase {
  input: "saveBases";
  max: number;
  min: number;
}

/**
 * The template an item is made from, by its id: one of its own type (`typeKey`, the column whose value its templates
 * are of), whose fields an item starts from; none too. A change of its type empties it.
 */
export interface TemplateFormField extends FormFieldBase {
  input: "template";
  typeKey: string;
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

/**
 * A field's value as a form sends it: a flag's, a number's, a text's or a choice's, a list's, a progression's, a
 * group's; null none.
 */
export type EntityFieldValue = boolean | number | string | string[] | null | EntityFieldGroupValues | ProgressionValue;

/**
 * A field of an entity's form, as its ruleset declares it (`FieldCodec.describe`): its label, what it's for, and the
 * input it takes, each with what it needs (a choice's options, a number's bounds, a progression's default and
 * bounds, a reference's kind).
 */
export type FormField =
  | AptitudeLevelsFormField
  | AptitudesFormField
  | ChoiceFormField
  | DecimalFormField
  | FlagFormField
  | GrantedFeatsFormField
  | GroupFormField
  | NumberFormField
  | ProgressionFormField
  | RefFormField
  | SaveBasesFormField
  | TemplateFormField
  | TextFormField;
