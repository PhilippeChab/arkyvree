/**
 * The form fields many forms share. The text fields take a registration spread in —
 * `<NameField {...form.register("name", nameRules)} error={errors.name} />` —
 * so they work with any form type; `SelectField` takes the form's `control`.
 */
import { MenuItem, type SxProps, TextField, type Theme } from "@mui/material";
import type { ReactNode, UIEventHandler } from "react";
import {
  type Control,
  Controller,
  type ControllerProps,
  type FieldError,
  type FieldPath,
  type FieldValues,
  type UseFormRegisterReturn,
} from "react-hook-form";

type RegisteredFieldProps = UseFormRegisterReturn & {
  error?: FieldError;
  autoFocus?: boolean;
  disabled?: boolean;
};

interface DescriptionFieldProps extends RegisteredFieldProps {
  /** Rows shown before it grows. */
  rows?: number;
  placeholder?: string;
}

interface PasswordFieldProps extends RegisteredFieldProps {
  label: string;
  /** Tells password managers whether to fill the saved password or suggest a new one. */
  autoComplete: "current-password" | "new-password";
}

type SelectOption = string | { value: string; label: ReactNode; disabled?: boolean };

interface SelectFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  /** The choices; a plain string is both value and label. */
  options: readonly SelectOption[];
  rules?: ControllerProps<T>["rules"];
  /** A first choice for no value ("None"); picking it stores null. */
  emptyLabel?: string;
  disabled?: boolean;
  size?: "small" | "medium";
  margin?: "normal";
  sx?: SxProps<Theme>;
  /** Loads more options as the open menu nears its end (see `createListboxScrollHandler`). */
  onMenuScroll?: UIEventHandler<HTMLElement>;
}

/** An entity's name. Register it with `nameRules`. */
export function NameField({
  error,
  label = "Name",
  helperText,
  ...field
}: RegisteredFieldProps & { label?: string; helperText?: string }) {
  return <TextField {...field} label={label} fullWidth error={!!error} helperText={error?.message ?? helperText} />;
}

/** An entity's description: several lines, resizable. */
export function DescriptionField({ error, rows = 3, ...field }: DescriptionFieldProps) {
  return (
    <TextField
      {...field}
      label="Description"
      fullWidth
      multiline
      minRows={rows}
      error={!!error}
      helperText={error?.message}
      sx={{ "& textarea": { resize: "vertical" } }}
    />
  );
}

/** An email address. Register it with `emailRules`. */
export function EmailField({ error, label = "Email", ...field }: RegisteredFieldProps & { label?: string }) {
  return (
    <TextField
      {...field}
      label={label}
      type="email"
      variant="outlined"
      fullWidth
      margin="normal"
      error={!!error}
      helperText={error?.message}
      slotProps={{ htmlInput: { autoComplete: "email" } }}
    />
  );
}

export function PasswordField({ error, label, autoComplete, ...field }: PasswordFieldProps) {
  return (
    <TextField
      {...field}
      label={label}
      type="password"
      variant="outlined"
      fullWidth
      margin="normal"
      error={!!error}
      helperText={error?.message}
      slotProps={{ htmlInput: { autoComplete } }}
    />
  );
}

/** A labeled select bound to a form field; a value missing from the options (not loaded yet) shows empty. */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  rules,
  emptyLabel,
  disabled,
  size,
  margin,
  sx,
  onMenuScroll,
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
          onChange={(event) => field.onChange(emptyLabel && !event.target.value ? null : event.target.value)}
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
          disabled={disabled}
          size={size}
          margin={margin}
          sx={sx}
          slotProps={
            onMenuScroll && {
              select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 300 }, onScroll: onMenuScroll } } } },
            }
          }
        >
          {emptyLabel && <MenuItem value="">{emptyLabel}</MenuItem>}
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
