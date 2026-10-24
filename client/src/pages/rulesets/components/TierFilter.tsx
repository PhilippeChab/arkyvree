import { MenuItem, TextField } from "@mui/material";

import { useRules } from "@/client/src/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface TierFilterProps {
  /** Adds an "All" choice. */
  allowAll?: boolean;
  /** The ruleset's, whose tiers it offers (`tiers`: 3.5's spell levels). */
  baseRules: BaseRules;
  onChange: (level: number | "") => void;
  /** The level, or "" for all of them. */
  value: number | "";
}

/** The tier select in the search bar of a list that ranks its entities (a spell list's, by spell level). */
export function TierFilter({ value, onChange, allowAll, baseRules }: TierFilterProps) {
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
