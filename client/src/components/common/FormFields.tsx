/**
 * The form fields many forms share, each bound to its form's field through `useController` (controlled: the form holds
 * the value, the field shows it and reports its changes): `<NameField control={form.control} name="name"
 * rules={nameRules} />`. `FormTextField` binds any text field; the others are its presets, and `SelectField` a select.
 */

import {
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  type SxProps,
  TextField,
  type TextFieldProps,
  type Theme,
} from "@mui/material";
import type { ReactNode, UIEventHandler } from "react";
import {
  type Control,
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  useController,
} from "react-hook-form";

/** A field of a form: its control, its name, and the rules its value is validated by. */
interface BoundFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  rules?: ControllerProps<T>["rules"];
}

interface DescriptionFieldProps<T extends FieldValues> extends PresetFieldProps<T> {
  rows?: number;
  placeholder?: string;
}

interface EmailFieldProps<T extends FieldValues> extends PresetFieldProps<T> {
  label?: string;
}

interface FieldRowProps {
  children: ReactNode;
}

/** A text field's own props: the form gives its value, change, error and ref. */
type FormTextFieldProps<T extends FieldValues> = BoundFieldProps<T> &
  Omit<TextFieldProps, "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "inputRef" | "error"> & {
    /** Whether its value is a number: NaN when it's empty, as the form's rules read it. */
    number?: boolean;
  };

interface NameFieldProps<T extends FieldValues> extends PresetFieldProps<T> {
  label?: string;
  helperText?: string;
}

interface PasswordFieldProps<T extends FieldValues> extends PresetFieldProps<T> {
  label: string;
  autoComplete: "current-password" | "new-password";
}

/** What a preset takes besides the form's field. */
interface PresetFieldProps<T extends FieldValues> extends BoundFieldProps<T> {
  autoFocus?: boolean;
  disabled?: boolean;
}

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  /** The choices; a plain string is both value and label. */
  options: readonly SelectOption[];
  rules?: ControllerProps<T>["rules"];
  /** A first choice, "None", and what picking it stores: null for a reference, "" for a text column. */
  none?: null | "";
  /** Shown under it while its value has no error. */
  helperText?: ReactNode;
  disabled?: boolean;
  sx?: SxProps<Theme>;
  /** Loads more options as the open menu nears its end (see `createListboxScrollHandler`). */
  onMenuScroll?: UIEventHandler<HTMLElement>;
  /** Follows the field's own change, for what it changes too. */
  onChange?: (value: string | null) => void;
}

type SelectOption = string | { value: string | number; label: ReactNode; disabled?: boolean };

interface SwitchFieldProps<T extends FieldValues> extends BoundFieldProps<T> {
  label: string;
  onChange?: (checked: boolean) => void;
}

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
export function DescriptionField<T extends FieldValues>({ rows = 3, placeholder, ...field }: DescriptionFieldProps<T>) {
  return (
    <FormTextField
      {...field}
      label="Description"
      multiline
      minRows={rows}
      placeholder={placeholder}
      sx={{ "& textarea": { resize: "vertical" } }}
    />
  );
}

/** An email address, validated by `emailRules`. */
export function EmailField<T extends FieldValues>({ label = "Email", ...field }: EmailFieldProps<T>) {
  return <FormTextField {...field} label={label} type="email" slotProps={{ htmlInput: { autoComplete: "email" } }} />;
}

/** Fields side by side from a tablet up, stacked on a phone: as far apart as the form's own fields. */
export function FieldRow({ children }: FieldRowProps) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
      {children}
    </Stack>
  );
}

/** A text field bound to a form's field: the form holds its value, and its error shows under it. */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  rules,
  number = false,
  helperText,
  ...props
}: FormTextFieldProps<T>) {
  const {
    field: { ref, value, onChange, ...field },
    fieldState,
  } = useController({ control, name, rules: number ? numberRules(rules) : rules });
  return (
    <TextField
      {...props}
      {...field}
      fullWidth
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

/** An entity's name, validated by `nameRules`. */
export function NameField<T extends FieldValues>({ label = "Name", helperText, ...field }: NameFieldProps<T>) {
  return <FormTextField {...field} label={label} helperText={helperText} />;
}

/** A password: `autoComplete` tells password managers whether to fill the saved one or suggest a new one. */
export function PasswordField<T extends FieldValues>({ label, autoComplete, ...field }: PasswordFieldProps<T>) {
  return <FormTextField {...field} label={label} type="password" slotProps={{ htmlInput: { autoComplete } }} />;
}

/** A labeled select bound to a form field; a value missing from the options (not loaded yet) shows empty. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  rules,
  none,
  helperText,
  disabled,
  sx,
  onMenuScroll,
  onChange,
}: SelectFieldProps<T>) {
  const choices = options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { ref, ...field }, fieldState }) => (
        <TextField
          {...field}
          // On the input, not the root, so a failed submit focuses the select.
          inputRef={ref}
          select
          fullWidth
          label={label}
          value={choices.some((choice) => choice.value === field.value) ? field.value : ""}
          onChange={(event) => {
            const value = none === null && event.target.value === "" ? null : event.target.value;
            field.onChange(value);
            onChange?.(value);
          }}
          error={!!fieldState.error}
          helperText={fieldState.error?.message ?? helperText}
          disabled={disabled}
          sx={sx}
          slotProps={
            onMenuScroll && {
              select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 300 }, onScroll: onMenuScroll } } } },
            }
          }
        >
          {none !== undefined && <MenuItem value="">None</MenuItem>}
          {choices.map((choice) => (
            <MenuItem key={choice.value} value={choice.value} disabled={choice.disabled}>
              {choice.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}

/** A labeled switch bound to a form's boolean field. `onChange` follows the field's own change, for what it changes too. */
export function SwitchField<T extends FieldValues>({ control, name, rules, label, onChange }: SwitchFieldProps<T>) {
  const {
    field: { ref, value, onChange: change, ...field },
  } = useController({ control, name, rules });
  return (
    <FormControlLabel
      label={label}
      control={
        <Switch
          {...field}
          slotProps={{ input: { ref } }}
          checked={!!value}
          onChange={(event) => {
            change(event.target.checked);
            onChange?.(event.target.checked);
          }}
        />
      }
    />
  );
}
