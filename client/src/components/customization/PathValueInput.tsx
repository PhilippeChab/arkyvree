import { MenuItem, TextField } from "@mui/material";

import type { PathValueType } from "@/shared/customization/target.ts";

import { pathChoices } from "./pathValues.ts";

interface PathValueInputProps {
  value: string;
  onChange: (value: string) => void;
  valueType?: PathValueType;
  possibleValues?: { value: string; label: string }[];
  label?: string;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  disabled?: boolean;
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
    >
      {options?.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
