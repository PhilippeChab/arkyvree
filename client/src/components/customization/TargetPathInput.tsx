import { rpc } from "@/client/src/services/rpc.ts";
import type { PathCompletion, PathValidationResult } from "@/shared/customization/target.ts";
import {
  Box,
  FormControl,
  FormHelperText,
  InputLabel,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TargetPathBrowser } from "./TargetPathBrowser.tsx";

interface TargetPathInputProps {
  value: string;
  onChange: (value: string) => void;
  rulesetId: string;
  kind: "modifier" | "requirement";
  entityType?: string;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  onPathInfoChange?: (
    pathInfo: { path: string; valueType: string; operators: string[]; possibleValues?: { value: string; label: string }[] } | null
  ) => void;
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
  onPathInfoChange,
}: TargetPathInputProps) {
  const [validationResult, setValidationResult] = useState<PathValidationResult | null>(null);
  const [selectedCompletion, setSelectedCompletion] = useState<PathCompletion | null>(null);
  const [userChanged, setUserChanged] = useState(false);
  const onPathInfoChangeRef = useRef(onPathInfoChange);
  onPathInfoChangeRef.current = onPathInfoChange;

  const segments = useMemo(
    () => (value ? value.split(".").filter(Boolean) : []),
    [value],
  );

  // A path is complete when the browser reports a selected leaf completion
  const isComplete = selectedCompletion?.kind === "property" && selectedCompletion?.path === value;

  // Validate when path becomes complete
  const validatePath = useCallback(
    async (path: string) => {
      if (!path) {
        setValidationResult(null);
        return;
      }
      try {
        const response = await rpc.api.rulesets[":id"].customization["target"].paths.validate.$post({
          param: { id: rulesetId },
          json: { path, kind },
        });
        if (response.ok) {
          setValidationResult(await response.json() as PathValidationResult);
        } else {
          setValidationResult(null);
        }
      } catch {
        setValidationResult(null);
      }
    },
    [rulesetId, kind],
  );

  useEffect(() => {
    if (isComplete && userChanged) {
      validatePath(value);
    } else {
      setValidationResult(null);
    }
  }, [isComplete, userChanged, value, validatePath]);

  // Fire onPathInfoChange exactly once per path change. The browser produces
  // a new selectedCompletion reference on every completions refetch, and
  // when the search clears after a path pick the cached completions briefly
  // don't contain the matching leaf — selectedCompletion goes momentarily
  // null and re-resolves. Without this dedupe, callers' "seed default
  // value/operator" logic re-runs and clobbers anything the user has typed.
  // We only fire null when `value` is actually empty (user cleared the path).
  const lastReportedPathRef = useRef<string | null>(null);

  // Reset the dedupe ref when the value is externally reassigned without a
  // user edit — e.g., parent reopens an edit dialog on a different
  // requirement that happens to share the same target. Without this, the
  // callback's seed logic skips re-firing and the parent's pathInfo stays
  // stale from the previous session.
  useEffect(() => {
    if (!userChanged) lastReportedPathRef.current = null;
  }, [value, userChanged, entityType, rulesetId, kind]);

  useEffect(() => {
    const callback = onPathInfoChangeRef.current;
    if (!callback) return;
    if (isComplete && selectedCompletion?.valueType && selectedCompletion?.operators) {
      const path = selectedCompletion.path ?? null;
      if (lastReportedPathRef.current === path) return;
      lastReportedPathRef.current = path;
      if (!path) return;
      callback({
        path,
        valueType: selectedCompletion.valueType,
        operators: selectedCompletion.operators,
        possibleValues: selectedCompletion.possibleValues,
      });
    } else if (!value) {
      if (lastReportedPathRef.current === null) return;
      lastReportedPathRef.current = null;
      callback(null);
    }
  }, [isComplete, selectedCompletion, value]);

  const hasError = error || (validationResult !== null && !validationResult.isValid);
  const errorMessage =
    helperText ||
    (validationResult && !validationResult.isValid && validationResult.errors?.[0]?.message) ||
    (validationResult && !validationResult.isValid && validationResult.suggestions?.length
      ? `Did you mean: ${validationResult.suggestions[0]}?`
      : undefined);

  return (
    <FormControl fullWidth={fullWidth} error={hasError}>
      <InputLabel
        shrink
        required={required}
        sx={{ backgroundColor: "background.paper", px: 0.5 }}
      >
        {label}
      </InputLabel>
      <Box
        sx={{
          border: 1,
          borderColor: hasError ? "error.main" : "divider",
          borderRadius: 1,
          px: 1.5,
          py: 1,
          mt: "16px",
          "&:hover": {
            borderColor: hasError ? "error.main" : "text.primary",
          },
        }}
      >
        <TargetPathBrowser
          rulesetId={rulesetId}
          kind={kind}
          entityType={entityType}
          segments={segments}
          isComplete={isComplete}
          disabled={disabled}
          onChange={(v) => { setUserChanged(true); onChange(v); }}
          onSelectedCompletion={setSelectedCompletion}
        />
      </Box>
      {errorMessage && <FormHelperText>{errorMessage}</FormHelperText>}
    </FormControl>
  );
}
