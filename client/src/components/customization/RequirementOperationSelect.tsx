import { REQUIREMENT_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";

interface RequirementOperationSelectProps {
  value: string;
  onChange: (value: string) => void;
  operators: string[];
  label?: string;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

export function RequirementOperationSelect({
  value,
  onChange,
  operators,
  label = "Operator",
  required = false,
  error = false,
  disabled = false,
  fullWidth = true,
}: RequirementOperationSelectProps) {
  // Check if the current value exists in the operators array
  const isValidValue = operators.includes(value);
  // Use empty string if the value is not in the operators array
  const safeValue = isValidValue ? value : "";

  const handleChange = (event: SelectChangeEvent) => {
    onChange(event.target.value);
  };

  return (
    <FormControl fullWidth={fullWidth} required={required} error={error} disabled={disabled}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={safeValue}
        label={label}
        onChange={handleChange}
      >
        {operators.map((operator) => (
          <MenuItem key={operator} value={operator}>
            {REQUIREMENT_OPERATOR_LABELS[operator] || operator}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
