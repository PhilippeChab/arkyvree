import { Box, FormControl, FormHelperText, InputLabel } from "@mui/material";

import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import type { TargetPathKind } from "@/shared/customization/target.ts";

import type { PathInfo } from "./pathValues.ts";
import { TargetPathBrowser } from "./TargetPathBrowser.tsx";
import { useTargetPath } from "./useTargetPath.ts";

interface TargetPathInputProps {
  disabled?: boolean;
  entityType?: string;
  error?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  kind: TargetPathKind;
  label?: string;
  /** The new path, and what it takes when it's a complete one picked from the list. */
  onChange: (value: string, picked?: PathInfo) => void;
  required?: boolean;
  rulesetId: string;
  value: string;
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
  const { target, error: targetError, pick } = useTargetPath(rulesetId, kind, entityType, value);
  // What the path takes didn't load: the field says so, under what its form says
  const shownHelperText = helperText ?? (targetError ? loadFailureMessage("Path", targetError) : undefined);
  const segments = value ? value.split(".").filter(Boolean) : [];

  return (
    // The field's border sits below its label, which the control holds over its top padding
    <FormControl fullWidth={fullWidth} error={error || !!targetError} sx={{ pt: 2 }}>
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
      {shownHelperText && <FormHelperText>{shownHelperText}</FormHelperText>}
    </FormControl>
  );
}
