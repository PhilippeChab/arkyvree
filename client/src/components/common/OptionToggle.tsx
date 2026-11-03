import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { type ElementType } from "react";

interface OptionToggleProps<T extends boolean | string> {
  /** What the choice means, under its buttons. */
  caption?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: T) => void;
  options: readonly ToggleOption<T>[];
  value: T;
}

/** One of an `OptionToggle`'s choices: its value, its label, and the icon before it. */
interface ToggleOption<T> {
  icon?: ElementType;
  label: string;
  value: T;
}

/**
 * A choice of one among a few, under its label (a ruleset's privacy and kind, a requirement's type): the selected one
 * can't be toggled off.
 */
export function OptionToggle<T extends boolean | string>({
  label,
  options,
  value,
  onChange,
  disabled,
  caption,
}: OptionToggleProps<T>) {
  return (
    <Box>
      <Typography variant="subtitle2" component="p" gutterBottom sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
        <ToggleButtonGroup
          value={value}
          exclusive
          onChange={(_, next: T | null) => next !== null && onChange(next)}
          disabled={disabled}
          size="small"
        >
          {options.map((option) => (
            <ToggleButton key={option.label} value={option.value}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {option.icon && <option.icon fontSize="small" />}
                <Typography variant="body2">{option.label}</Typography>
              </Stack>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {caption && (
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {caption}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
