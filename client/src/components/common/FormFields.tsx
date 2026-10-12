/**
 * The form fields many forms share, each bound to its form's field through `useController` (controlled: the form holds
 * the value, the field shows it and reports its changes): `<NameField control={form.control} name="name" />`.
 * `FormTextField` binds any text field; the others are its presets, which apply their own rules, `SelectField` a select
 * and `SwitchField` a switch. Under `ReadOnlyFields` each shows its value as it is, read-only, as one given `readOnly` does.
 */

import { FormControlLabel, MenuItem, Switch, TextField, type TextFieldProps } from "@mui/material";
import type { ReactNode, UIEventHandler } from "react";
import { type Control, type ControllerProps, type FieldPath, type FieldValues, useController } from "react-hook-form";

import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { EMAIL_RULES, NAME_RULES, OPTIONAL_EMAIL_RULES } from "@/client/src/lib/validation.ts";

import { EMPTY_VALUE_TEXT, EmptyValue } from "./EmptyValue.tsx";
import { useReadOnlyFields } from "./useReadOnlyFields.ts";

/** A field of a form: its control, its name, and the rules its value is validated by. */
interface BoundFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  rules?: ControllerProps<T>["rules"];
}

interface DescriptionFieldProps<T extends FieldValues> extends PresetFieldProps<T> {
  placeholder?: string;
  rows?: number;
}

interface EmailFieldProps<T extends FieldValues> extends Omit<PresetFieldProps<T>, "rules"> {
  /** It may be left empty (an invite's, sent only when given): checked only once it's written. */
  optional?: boolean;
  placeholder?: string;
}

interface NameFieldProps<T extends FieldValues> extends Omit<PresetFieldProps<T>, "rules"> {
  helperText?: string;
  label?: string;
}

interface PasswordFieldProps<T extends FieldValues> extends PresetFieldProps<T> {
  autoComplete: "current-password" | "new-password";
  label: string;
}

/** What a preset takes besides the form's field. */
interface PresetFieldProps<T extends FieldValues> extends BoundFieldProps<T> {
  autoFocus?: boolean;
  disabled?: boolean;
}

interface SelectFieldProps<T extends FieldValues> extends BoundFieldProps<T> {
  disabled?: boolean;
  /** A first choice for no value ("None"): picking it stores `""`, as an empty text field holds. */
  emptyLabel?: string;
  /** Shown under it while its value has no error. */
  helperText?: ReactNode;
  label: string;
  /** Why its options didn't load: said under it. */
  loadError?: unknown;
  /** What follows from a pick, in the same event: the fields that depended on the old value reset. */
  onChange?: (value: SelectValue) => void;
  /** Loads more options as the open menu nears its end (see `createListboxScrollHandler`). */
  onMenuScroll?: UIEventHandler<HTMLElement>;
  /** The choices; a plain string is both value and label. */
  options: readonly SelectOption[];
  /** Shown as it is, its menu closed: a viewer who can't edit it reads it (`readOnly`, never a disabled field). */
  readOnly?: boolean;
  size?: "small" | "medium";
}

interface SwitchFieldProps<T extends FieldValues> extends BoundFieldProps<T> {
  label: string;
  onChange?: (checked: boolean) => void;
  /** Shown as it is: a viewer who can't edit it reads it, its clicks changing nothing. */
  readOnly?: boolean;
}

/** A text field's own props: the form gives its value, change, error and ref. */
type FormTextFieldProps<T extends FieldValues> = BoundFieldProps<T> &
  Omit<TextFieldProps, "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "inputRef" | "error"> & {
    /** Whether its value is a number: NaN when it's empty, as the form's rules read it. */
    number?: boolean;
  };

type SelectOption = string | { disabled?: boolean; label: ReactNode; value: SelectValue };

/** What a select's choice holds: a word, or a number (a hit die) */
type SelectValue = string | number;

/** A text field of several lines: its lines to start (`rows`, 3 by default), and the text field's own props. */
type TextAreaFieldProps<T extends FieldValues> = Omit<
  FormTextFieldProps<T>,
  "minRows" | "multiline" | "number" | "sx"
> & {
  rows?: number;
};

/**
 * A number field's rules: its empty value is NaN, which `required` doesn't count as empty (only `""`), so a required one
 * checks it too.
 */
function numberRules<T extends FieldValues>(rules: BoundFieldProps<T>["rules"]): BoundFieldProps<T>["rules"] {
  const required = rules?.required;
  if (!required) return rules;
  const message = typeof required === "object" && "message" in required ? required.message : required;
  const isNumber = (value: unknown) => !Number.isNaN(value) || (typeof message === "boolean" ? false : message);
  const { validate } = rules;
  return { ...rules, validate: typeof validate === "function" ? { validate, isNumber } : { ...validate, isNumber } };
}

/** An entity's description: several lines, resizable. */
export function DescriptionField<T extends FieldValues>({ rows, placeholder, ...field }: DescriptionFieldProps<T>) {
  return <TextAreaField {...field} label="Description" rows={rows} placeholder={placeholder} />;
}

/** An email address, "Email Address" wherever it's asked, validated by `EMAIL_RULES` (`OPTIONAL_EMAIL_RULES`). */
export function EmailField<T extends FieldValues>({ optional = false, ...field }: EmailFieldProps<T>) {
  return (
    <FormTextField
      {...field}
      rules={optional ? OPTIONAL_EMAIL_RULES : EMAIL_RULES}
      label="Email Address"
      type="email"
      variant="outlined"
      fullWidth
      slotProps={{ htmlInput: { autoComplete: "email" } }}
    />
  );
}

/**
 * A text field bound to a form's field: the form holds its value, and its error shows under it. Under `ReadOnlyFields`
 * it's read-only, its label above its value, "—" when it holds none, and a multiline one as tall as its text.
 */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  rules,
  number = false,
  helperText,
  slotProps,
  ...props
}: FormTextFieldProps<T>) {
  const {
    field: { ref, value, onChange, ...field },
    fieldState,
  } = useController({ control, name, rules: number ? numberRules(rules) : rules });
  const readOnly = useReadOnlyFields();
  return (
    <TextField
      {...props}
      {...field}
      slotProps={
        readOnly
          ? {
              ...slotProps,
              input: { ...slotProps?.input, readOnly },
              inputLabel: { ...slotProps?.inputLabel, shrink: true },
            }
          : slotProps
      }
      placeholder={readOnly ? EMPTY_VALUE_TEXT : props.placeholder}
      minRows={readOnly ? undefined : props.minRows}
      // A number field is one: a select of numbers keeps its own
      type={number && !props.select ? "number" : props.type}
      // On the input, so a failed submit focuses it
      inputRef={ref}
      value={value === undefined || value === null || (number && Number.isNaN(value)) ? "" : value}
      onChange={(event) => {
        const text = event.target.value;
        onChange(number ? (text === "" ? Number.NaN : Number(text)) : text);
      }}
      error={!!fieldState.error}
      helperText={fieldState.error?.message ?? helperText}
    />
  );
}

/** An entity's name, validated by `NAME_RULES`. */
export function NameField<T extends FieldValues>({ label = "Name", helperText, ...field }: NameFieldProps<T>) {
  return <FormTextField {...field} rules={NAME_RULES} label={label} helperText={helperText} fullWidth />;
}

/** A password: `autoComplete` tells password managers whether to fill the saved one or suggest a new one. */
export function PasswordField<T extends FieldValues>({ label, autoComplete, ...field }: PasswordFieldProps<T>) {
  return (
    <FormTextField
      {...field}
      label={label}
      type="password"
      variant="outlined"
      fullWidth
      slotProps={{ htmlInput: { autoComplete } }}
    />
  );
}

/**
 * A labeled select bound to a form field; a value missing from the options (not loaded yet) shows empty. Read-only, its
 * menu closed, when it's `readOnly` or under `ReadOnlyFields`, which shows its label above its value, "—" for none.
 */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  rules,
  emptyLabel,
  onChange,
  helperText,
  loadError,
  disabled,
  readOnly: ownReadOnly = false,
  size,
  onMenuScroll,
}: SelectFieldProps<T>) {
  const formReadOnly = useReadOnlyFields();
  const readOnly = ownReadOnly || formReadOnly;
  const choices = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  const {
    field: { ref, ...field },
    fieldState,
  } = useController({ control, name, rules });
  return (
    <TextField
      {...field}
      // On the input, not the root, so a failed submit focuses the select.
      inputRef={ref}
      select
      fullWidth
      label={label}
      value={choices.some((choice) => choice.value === field.value) ? field.value : ""}
      onChange={(event) => {
        field.onChange(event.target.value);
        onChange?.(event.target.value);
      }}
      error={!!fieldState.error || !!loadError}
      helperText={fieldState.error?.message ?? (loadError ? loadFailureMessage(label, loadError) : helperText)}
      disabled={disabled}
      size={size}
      slotProps={{
        input: { readOnly },
        inputLabel: formReadOnly ? { shrink: true } : undefined,
        select: {
          ...(onMenuScroll && {
            MenuProps: { slotProps: { paper: { sx: { maxHeight: 300 }, onScroll: onMenuScroll } } },
          }),
          ...(formReadOnly && {
            displayEmpty: true,
            renderValue: (value: unknown) => choices.find((choice) => choice.value === value)?.label ?? <EmptyValue />,
          }),
        },
      }}
    >
      {emptyLabel && <MenuItem value="">{emptyLabel}</MenuItem>}
      {choices.map((choice) => (
        <MenuItem key={choice.value} value={choice.value} disabled={choice.disabled}>
          {choice.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * A labeled switch bound to a form's boolean field. `onChange` follows the field's own change, for what it changes too.
 * Read-only, its clicks changing nothing, when it's `readOnly` or under `ReadOnlyFields`.
 */
export function SwitchField<T extends FieldValues>({
  control,
  name,
  rules,
  label,
  onChange,
  readOnly: ownReadOnly = false,
}: SwitchFieldProps<T>) {
  const {
    field: { ref, value, onChange: change, ...field },
  } = useController({ control, name, rules });
  const formReadOnly = useReadOnlyFields();
  const readOnly = ownReadOnly || formReadOnly;
  return (
    <FormControlLabel
      label={label}
      control={
        <Switch
          {...field}
          slotProps={{ input: { ref, readOnly, "aria-readonly": readOnly } }}
          checked={!!value}
          onChange={(event) => {
            if (readOnly) return;
            change(event.target.checked);
            onChange?.(event.target.checked);
          }}
        />
      }
    />
  );
}

/**
 * A text of several lines (a description, notes): as tall as its `rows` to start, taller as it's written, and resizable
 * by its corner, down the page. Under `ReadOnlyFields` it's as tall as its text.
 */
export function TextAreaField<T extends FieldValues>({ rows = 3, ...field }: TextAreaFieldProps<T>) {
  return <FormTextField {...field} fullWidth multiline minRows={rows} sx={{ "& textarea": { resize: "vertical" } }} />;
}
