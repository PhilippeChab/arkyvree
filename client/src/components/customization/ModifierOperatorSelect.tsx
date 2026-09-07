import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";

interface ModifierOperatorSelectProps {
  value: string;
  onChange: (value: string) => void;
  operators: string[];
  label?: string;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function ModifierOperatorSelect({
  value,
  onChange,
  operators,
  label = "Operator",
  required = false,
  error = false,
  disabled = false,
  fullWidth = true,
}: ModifierOperatorSelectProps) {
  const handleChange = (event: SelectChangeEvent) => {
    onChange(event.target.value);
  };

  return (
    <FormControl fullWidth={fullWidth} required={required} error={error} disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        label={label}
        onChange={handleChange}
      >
        {operators.map((operator) => (
          <MenuItem key={operator} value={operator}>
            {MODIFIER_OPERATOR_LABELS[operator] || operator}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
