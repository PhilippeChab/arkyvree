import { MenuItem, TextField } from "@mui/material";
import { type Ref } from "react";

import type { PathValueType } from "@/shared/customization/target.ts";

import { type PathChoice, pathChoices } from "./pathValues.ts";

interface PathValueInputProps {
  disabled?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  label?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  possibleValues?: PathChoice[];
  required?: boolean;
  value: string;
  valueType?: PathValueType;
}

export function PathValueInput({
  value,
  onChange,
  valueType,
  possibleValues,
  label = "Value",
  placeholder,
  required = false,
  error = false,
  helperText,
  fullWidth = true,
  disabled = false,
  inputRef,
}: PathValueInputProps) {
  const options = pathChoices(valueType, possibleValues);

  return (
    <TextField
      select={!!options}
      type={options || valueType !== "number" ? "text" : "number"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      label={label}
      placeholder={placeholder}
      required={required}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
      disabled={disabled}
      inputRef={inputRef}
    >
      {options?.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
