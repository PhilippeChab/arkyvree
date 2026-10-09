import { TextField } from "@mui/material";
import { type Ref } from "react";

import { propertyValueCompletionsQuery } from "./customizationQueries.ts";
import { PropertyCompletionAutocomplete } from "./PropertyCompletionAutocomplete.tsx";

interface PropertyValueInputProps {
  error?: boolean;
  helperText?: string;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  propertyType: string;
  rulesetId: string;
  value: string;
}

/** What a property's value says while it's empty, typed or suggested */
const PLACEHOLDER = "Enter the property value…";

/** A property's value, which it requires: free text, suggesting the values its type takes once it has one. */
export function PropertyValueInput({ rulesetId, propertyType, ...props }: PropertyValueInputProps) {
  // Values are suggested per property type; until one is picked, it's plain text.
  if (!propertyType) {
    const { value, onChange, ...fieldProps } = props;
    return (
      <TextField
        {...fieldProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label="Value"
        placeholder={PLACEHOLDER}
        required
        fullWidth
      />
    );
  }

  return (
    <PropertyCompletionAutocomplete
      {...props}
      label="Value"
      placeholder={PLACEHOLDER}
      required
      query={(search) => propertyValueCompletionsQuery(rulesetId, propertyType, search)}
      loadingText="Loading values…"
      noOptionsText="No values found"
    />
  );
}
