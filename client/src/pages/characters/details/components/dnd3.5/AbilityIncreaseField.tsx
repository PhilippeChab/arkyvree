import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from "@mui/material";
import { useId } from "react";

import { computeAbilityModifier, sortAbilities } from "@/client/src/components/characters/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { capitalize } from "@/shared/text.ts";

import type { LevelAbilities } from "./levelUp/index.ts";

interface AbilityIncreaseFieldProps {
  abilities: LevelAbilities;
  baseRules: BaseRules;
  /** Its radios' group, one per field (a level's). */
  name: string;
  onChange: (abilityId: string) => void;
  value: string | null;
}

/** The ability a level's ability increase goes to, each with its score and modifier. */
export function AbilityIncreaseField({ abilities, baseRules, name, value, onChange }: AbilityIncreaseFieldProps) {
  // The radios are named by the field's label
  const labelId = useId();
  return (
    <FormControl component="fieldset" sx={{ "& .MuiFormLabel-root": { mb: 0.25 } }}>
      <FormLabel component="legend" id={labelId}>
        Select an ability to increase
      </FormLabel>
      <RadioGroup aria-labelledby={labelId} name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {sortAbilities(Object.entries(abilities), baseRules, ([key]) => key).map(([key, ability]) => (
          <FormControlLabel
            key={ability.abilityId}
            value={ability.abilityId}
            control={<Radio />}
            label={`${capitalize(key)}: ${ability.total} (${formatSigned(computeAbilityModifier(ability.total))})`}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
