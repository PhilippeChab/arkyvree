import { TextField } from "@mui/material";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";
import { propertyValueCompletionsQuery } from "./customizationQueries.ts";

interface PropertyValueInputProps {
  value: string;
  onChange: (value: string) => void;
  rulesetId: string;
  propertyType: string;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}

export function PropertyValueInput({
  rulesetId,
  propertyType,
  label = "Value",
  placeholder = "Enter the property value...",
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
      enabled={!!rulesetId}
      loadingText="Loading values..."
      noOptionsText="No values found"
    />
  );
}
