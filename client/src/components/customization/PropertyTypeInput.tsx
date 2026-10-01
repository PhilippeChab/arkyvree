import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { EntityType } from "@/shared/customization/properties.ts";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";

interface PropertyTypeInputProps {
  value: string;
  onChange: (value: string) => void;
  rulesetId: string;
  entityType?: EntityType;
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
  placeholder = "Enter or select a property type...",
  ...props
}: PropertyTypeInputProps) {
  return (
    <CompletionAutocomplete
      {...props}
      label={label}
      placeholder={placeholder}
      queryKey={(search) => queryKeys.rulesets.propertyTypeCompletions(rulesetId, search, entityType)}
      fetchPage={(search, page) =>
        parseResponse(
          rpc.api.rulesets[":id"].customization.properties.types.completions.$get({
            param: { id: rulesetId },
            query: { query: search, limit: "10", page: page.toString(), entityType: entityType || undefined },
          }),
        )
      }
      enabled={!!rulesetId}
      loadingText="Loading property types..."
      noOptionsText="No property types found"
    />
  );
}
