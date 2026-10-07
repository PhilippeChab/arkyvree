import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";
import { propertyTypeCompletionsQuery } from "./customizationQueries.ts";

interface PropertyTypeInputProps {
  value: string;
  onChange: (value: string) => void;
  rulesetId: string;
  entityType?: PropertyEntityType;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
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
