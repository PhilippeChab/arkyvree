import { TextField } from "@mui/material";
import { type Ref } from "react";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";
import { propertyValueCompletionsQuery } from "./customizationQueries.ts";

interface PropertyValueInputProps {
  disabled?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  label?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  propertyType: string;
  required?: boolean;
  rows?: number;
  rulesetId: string;
  value: string;
}

export function PropertyValueInput({
  rulesetId,
  propertyType,
  label = "Value",
  placeholder = "Enter the property value…",
  fullWidth = true,
  ...props
}: PropertyValueInputProps) {
  // Values are suggested per property type; until one is picked, it's plain text.
  if (!propertyType) {
    const { value, onChange, ...fieldProps } = props;
    return (
      <TextField
        {...fieldProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        placeholder={placeholder}
        fullWidth={fullWidth}
      />
    );
  }

  return (
    <CompletionAutocomplete
      {...props}
      label={label}
      placeholder={placeholder}
      fullWidth={fullWidth}
      query={(search) => propertyValueCompletionsQuery(rulesetId, propertyType, search)}
      loadingText="Loading values…"
      noOptionsText="No values found"
    />
  );
}
