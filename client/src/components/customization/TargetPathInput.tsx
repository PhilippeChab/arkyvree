import { Box, FormControl, FormHelperText, InputLabel } from "@mui/material";

import { TargetPathBrowser } from "./TargetPathBrowser.tsx";
import { type PathInfo, useTargetPath } from "./useTargetPath.ts";

interface TargetPathInputProps {
  value: string;
  /** The new path, and what it takes when it's a complete one picked from the list. */
  onChange: (value: string, picked?: PathInfo) => void;
  rulesetId: string;
  kind: "modifier" | "requirement";
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
    <FormControl fullWidth={fullWidth} error={error}>
      <InputLabel shrink required={required} sx={{ backgroundColor: "background.paper", px: 0.5 }}>
        {label}
      </InputLabel>
      <Box
        sx={{
          border: 1,
          borderColor: error ? "error.main" : "divider",
          borderRadius: 1,
          px: 2,
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
