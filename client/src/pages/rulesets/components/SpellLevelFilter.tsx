import { MenuItem, TextField } from "@mui/material";

import { getVocabulary } from "@/client/src/pages/rulesets/vocabularyFactory.ts";
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
  const { labels, levels } = getVocabulary(baseRules).spellLevels;
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
      {levels.map((level) => (
        <MenuItem key={level} value={level}>
          {labels[level]}
        </MenuItem>
      ))}
    </TextField>
  );
}
