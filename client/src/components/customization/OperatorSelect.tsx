import { MenuItem, TextField } from "@mui/material";
import { type Ref } from "react";

import { MODIFIER_OPERATOR_LABELS, REQUIREMENT_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";

interface OperatorSelectProps {
  error?: boolean;
  /** Why the form refuses it. */
  helperText?: string;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  kind: "modifier" | "requirement";
  onChange: (value: string) => void;
  /** The operators the target path allows. */
  operators: string[];
  value: string;
}

const OPERATOR_LABELS = { modifier: MODIFIER_OPERATOR_LABELS, requirement: REQUIREMENT_OPERATOR_LABELS };

/** A modifier's or requirement's operator, among those its target path allows. */
export function OperatorSelect({
  kind,
  value,
  onChange,
  operators,
  error = false,
  helperText,
  inputRef,
}: OperatorSelectProps) {
  return (
    <TextField
      select
      fullWidth
      label="Operator"
      error={error}
      helperText={helperText}
      inputRef={inputRef}
      // Until the path's operators load, a saved one shows empty rather than out of range.
      value={operators.includes(value) ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    >
      {operators.map((operator) => (
        <MenuItem key={operator} value={operator}>
          {OPERATOR_LABELS[kind][operator] || operator}
        </MenuItem>
      ))}
    </TextField>
  );
}
