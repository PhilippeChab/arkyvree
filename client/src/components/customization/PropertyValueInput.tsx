import { TextField } from "@mui/material";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import { CompletionAutocomplete } from "./CompletionAutocomplete.tsx";

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
      queryKey={(search) => queryKeys.rulesets.propertyValueCompletions(rulesetId, propertyType, search)}
      fetchPage={(search, page) =>
        parseResponse(
          rpc.api.rulesets[":id"].customization.properties.values.completions.$get({
            param: { id: rulesetId },
            query: { type: propertyType, query: search, limit: "10", page: page.toString() },
          }),
        )
      }
      enabled={!!rulesetId}
      loadingText="Loading values..."
      noOptionsText="No values found"
    />
  );
}
