import { MenuItem, TextField } from "@mui/material";

import { SPELL_LEVELS } from "@/shared/dnd3.5/spells.ts";

interface SpellLevelFilterProps {
  /** Adds an "All" choice. */
  allowAll?: boolean;
  onChange: (level: number | "") => void;
  /** The level, or "" for all of them. */
  value: number | "";
}

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
