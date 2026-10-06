import { parseResponse } from "hono/client";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";

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
  placeholder = "Enter or select a property type...",
  ...props
}: PropertyTypeInputProps) {
  return (
    <CompletionAutocomplete
      {...props}
      label={label}
      placeholder={placeholder}
      queryKey={(search) => queryKeys.rulesets.propertyTypeCompletions(rulesetId, search, entityType)}
      pageFn={(search, page) =>
        parseResponse(
          rpc.api.rulesets[":id"].customization.properties.types.completions.$get({
            param: { id: rulesetId },
            query: {
              query: search,
              limit: "10",
              page: page.toString(),
              entityType: entityType ? getUrlSegment(entityType) : undefined,
            },
          }),
        )
      }
      enabled={!!rulesetId}
      loadingText="Loading property types..."
      noOptionsText="No property types found"
    />
  );
}
