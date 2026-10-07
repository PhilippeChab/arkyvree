import { Box, FormControl, FormHelperText, InputLabel } from "@mui/material";

import type { TargetPathKind } from "@/shared/customization/target.ts";

import type { PathInfo } from "./pathValues.ts";
import { TargetPathBrowser } from "./TargetPathBrowser.tsx";
import { useTargetPath } from "./useTargetPath.ts";

interface TargetPathInputProps {
  value: string;
  /** The new path, and what it takes when it's a complete one picked from the list. */
  onChange: (value: string, picked?: PathInfo) => void;
  rulesetId: string;
  kind: TargetPathKind;
  entityType?: string;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function TargetPathInput({
  value,
  onChange,
  rulesetId,
  kind,
  entityType,
  label = "Target Path",
  required = false,
  error = false,
  helperText,
  disabled = false,
  fullWidth = true,
}: TargetPathInputProps) {
  const { target, pick } = useTargetPath(rulesetId, kind, entityType, value);
  const segments = value ? value.split(".").filter(Boolean) : [];

  return (
    // The field's border sits below its label, which the control holds over its top padding
    <FormControl fullWidth={fullWidth} error={error} sx={{ pt: 2 }}>
      <InputLabel shrink required={required} sx={{ bgcolor: "background.paper", px: 0.5 }}>
        {label}
      </InputLabel>
      <Box
        sx={{
          border: 1,
          borderColor: error ? "error.main" : "divider",
          borderRadius: 1,
          px: 1.5,
          py: 1,
          "&:hover": {
            borderColor: error ? "error.main" : "text.primary",
          },
        }}
      >
        <TargetPathBrowser
          rulesetId={rulesetId}
          kind={kind}
          entityType={entityType}
          segments={segments}
          isComplete={target !== null}
          disabled={disabled}
          onChange={(path, picked) => {
            if (picked) pick(picked);
            onChange(path, picked);
          }}
        />
      </Box>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
