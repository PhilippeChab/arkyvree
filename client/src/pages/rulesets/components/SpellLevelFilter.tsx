import { MenuItem, TextField } from "@mui/material";

interface SpellLevelFilterProps {
  /** The level, or "" for all of them. */
  value: number | "";
  onChange: (level: number | "") => void;
  /** Adds an "All" choice. */
  allowAll?: boolean;
}

const SPELL_LEVELS = Array.from({ length: 10 }, (_, level) => level);

/** The spell level select in a spell list's search bar. */
export function SpellLevelFilter({ value, onChange, allowAll }: SpellLevelFilterProps) {
  return (
    <TextField
      select
      size="small"
      label="Level"
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      sx={{ minWidth: 100 }}
    >
      {allowAll && <MenuItem value="">All</MenuItem>}
      {SPELL_LEVELS.map((level) => (
        <MenuItem key={level} value={level}>
          {level}
        </MenuItem>
      ))}
    </TextField>
  );
}
