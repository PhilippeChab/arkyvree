import { MenuItem, TextField } from "@mui/material";

import { MODIFIER_OPERATOR_LABELS, REQUIREMENT_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";

const OPERATOR_LABELS = { modifier: MODIFIER_OPERATOR_LABELS, requirement: REQUIREMENT_OPERATOR_LABELS };

interface OperatorSelectProps {
  kind: "modifier" | "requirement";
  value: string;
  onChange: (value: string) => void;
  /** The operators the target path allows. */
  operators: string[];
  error?: boolean;
}

/** A modifier's or requirement's operator, among those its target path allows. */
export function OperatorSelect({ kind, value, onChange, operators, error = false }: OperatorSelectProps) {
  return (
    <TextField
      select
      fullWidth
      label="Operator"
      error={error}
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
