import { MenuItem, TextField } from "@mui/material";

interface PathValueInputProps {
  value: string;
  onChange: (value: string) => void;
  valueType?: "number" | "string" | "boolean";
  possibleValues?: { value: string; label: string }[];
  label?: string;
  placeholder?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
  disabled?: boolean;
}

const BOOLEAN_OPTIONS: { value: string; label: string }[] = [
  { value: "true", label: "True" },
  { value: "false", label: "False" },
];

export function PathValueInput({
  value,
  onChange,
  valueType,
  possibleValues,
  label = "Value",
  placeholder,
  required = false,
  error = false,
  helperText,
  fullWidth = true,
  disabled = false,
}: PathValueInputProps) {
  const options = possibleValues ?? (valueType === "boolean" ? BOOLEAN_OPTIONS : null);

  if (options) {
    return (
      <TextField
        select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        placeholder={placeholder}
        required={required}
        error={error}
        helperText={helperText}
        fullWidth={fullWidth}
        disabled={disabled}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <TextField
      type={valueType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      label={label}
      placeholder={placeholder}
      required={required}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
      disabled={disabled}
    />
  );
}
