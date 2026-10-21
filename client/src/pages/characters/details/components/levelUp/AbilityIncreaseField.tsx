import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from "@mui/material";
import { useId } from "react";

import { formatSigned } from "@/shared/text.ts";

import type { LevelAbilities } from "./levelAnswers.ts";

interface AbilityIncreaseFieldProps {
  /** The character's abilities, in the order its sheet lists them. */
  abilities: LevelAbilities;
  /** Its radios' group, one per field (a level's). */
  name: string;
  onChange: (abilityId: string) => void;
  /** What it asks, its rules' ("Select an ability to increase") */
  prompt: string | undefined;
  value: string | null;
}

/** The ability a level's ability increase goes to, each with its score and modifier. */
export function AbilityIncreaseField({ abilities, name, prompt, value, onChange }: AbilityIncreaseFieldProps) {
  // The radios are named by the field's label
  const labelId = useId();
  return (
    <FormControl component="fieldset" sx={{ "& .MuiFormLabel-root": { mb: 0.25 } }}>
      <FormLabel component="legend" id={labelId}>
        {prompt}
      </FormLabel>
      <RadioGroup aria-labelledby={labelId} name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {abilities.map((ability) => (
          <FormControlLabel
            key={ability.abilityId}
            value={ability.abilityId}
            control={<Radio />}
            label={`${ability.name}: ${ability.total} (${formatSigned(ability.modifier)})`}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
