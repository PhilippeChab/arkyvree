/** What every field of a form has. */
interface FormFieldBase {
  /** What it's for, as its ruleset says. */
  help: string;
  /** Where its value goes in the form's fields: its name, under its group's (`weapon.damage`). */
  key: string;
  label: string;
  shownWhen?: ShownWhen;
}

/** When a form shows a field: while its value at `path` (a field's, `fields.<name>`, or a column's) is in `values`. */
interface ShownWhen {
  path: string;
  values: readonly (boolean | string)[];
}

/** A choice of one value among its options (a select), or of several (`multiple`). */
export interface ChoiceFormField extends FormFieldBase {
  input: "choice";
  multiple: boolean;
  options: readonly string[];
}

/** A group's fields' values, by name. */
export interface EntityFieldGroupValues {
  [key: string]: boolean | number | number[] | string | string[] | null;
}

/** An entity's fields' values as its form sends them, by name (one it leaves out, none): what its save reads. */
export interface EntityFieldValues {
  [key: string]: EntityFieldValue | undefined;
}

/** A yes or no: none too, when it's `nullable` (an item's, which none leaves to its template). */
export interface FlagFormField extends FormFieldBase {
  input: "flag";
  nullable: boolean;
}

/** Fields of their own, which a form shows under their `label`. */
export interface GroupFormField {
  fields: FormField[];
  input: "group";
  /** Where its fields' values go in the form's fields. */
  key: string;
  label: string;
  shownWhen?: ShownWhen;
}

/** A whole number in its bounds: none, when it has no `default`. */
export interface NumberFormField extends FormFieldBase {
  default: number | null;
  input: "number";
  max?: number;
  min?: number;
}

/**
 * A count per level, of `levels` levels, the first's first, each from none to `max`: what each level grants, its
 * `default` without one of its own.
 */
export interface PerLevelFormField extends FormFieldBase {
  default: number[];
  input: "perLevel";
  levels: number;
  max: number;
}

/** An entity of the ruleset, by its id (`references`: its kind, `abilities`): none too, unless it's `required`. */
export interface RefFormField extends FormFieldBase {
  input: "ref";
  references: string;
  required: boolean;
}

/** A free text, or several (`multiple`), with an example of one (`placeholder`). */
export interface TextFormField extends FormFieldBase {
  input: "text";
  multiple: boolean;
  placeholder?: string;
}

/**
 * A field's value as a form sends it: a flag's, a number's, a text's or a choice's, a list's, a count per level's, a
 * group's; null none.
 */
export type EntityFieldValue = boolean | number | number[] | string | string[] | null | EntityFieldGroupValues;

/**
 * A field of an entity's form, as its ruleset declares it (`FieldCodec.describe`): its label, what it's for, and the
 * input it takes, each with what it needs (a choice's options, a number's bounds, a count per level's levels, a
 * reference's kind).
 */
export type FormField =
  | ChoiceFormField
  | FlagFormField
  | GroupFormField
  | NumberFormField
  | PerLevelFormField
  | RefFormField
  | TextFormField;
