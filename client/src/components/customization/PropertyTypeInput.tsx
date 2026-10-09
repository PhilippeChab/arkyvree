import { type Ref } from "react";

import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";
import { propertyTypeCompletionsQuery } from "./customizationQueries.ts";

interface PropertyTypeInputProps {
  entityType?: PropertyEntityType;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  rulesetId: string;
  value: string;
}

/** A property's type: free text, suggesting the types the engine and the ruleset use for its entity's type. */
export function PropertyTypeInput({ rulesetId, entityType, ...props }: PropertyTypeInputProps) {
  return (
    <CompletionAutocomplete
      {...props}
      label="Type"
      placeholder="e.g., tag, category, note"
      query={(search) => propertyTypeCompletionsQuery(rulesetId, search, entityType)}
      loadingText="Loading property types…"
      noOptionsText="No property types found"
    />
  );
}
