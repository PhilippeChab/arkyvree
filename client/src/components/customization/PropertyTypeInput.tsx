import { type Ref } from "react";

import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";
import { propertyTypeCompletionsQuery } from "./customizationQueries.ts";

interface PropertyTypeInputProps {
  disabled?: boolean;
  entityType?: PropertyEntityType;
  error?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  label?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  rulesetId: string;
  value: string;
}

export function PropertyTypeInput({
  rulesetId,
  entityType,
  label = "Property Type",
  placeholder = "Enter or select a property type…",
  ...props
}: PropertyTypeInputProps) {
  return (
    <CompletionAutocomplete
      {...props}
      label={label}
      placeholder={placeholder}
      query={(search) => propertyTypeCompletionsQuery(rulesetId, search, entityType)}
      enabled={!!rulesetId}
      loadingText="Loading property types…"
      noOptionsText="No property types found"
    />
  );
}
