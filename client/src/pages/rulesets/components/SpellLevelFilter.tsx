import { MenuItem, TextField } from "@mui/material";

import { useRules } from "@/client/src/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface SpellLevelFilterProps {
  /** Adds an "All" choice. */
  allowAll?: boolean;
  /** The ruleset's, whose spell levels it offers. */
  baseRules: BaseRules;
  onChange: (level: number | "") => void;
  /** The level, or "" for all of them. */
  value: number | "";
}

/** The spell level select in a spell list's search bar. */
export function SpellLevelFilter({ value, onChange, allowAll, baseRules }: SpellLevelFilterProps) {
  const { rules } = useRules(baseRules);
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
      {rules?.tiers.map(({ label, level }) => (
        <MenuItem key={level} value={level}>
          {label}
        </MenuItem>
      ))}
    </TextField>
  );
}
