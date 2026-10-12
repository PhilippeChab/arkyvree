import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from "@mui/material";
import { useId } from "react";

import { sortAbilities } from "@/client/src/components/characters/index.ts";
import { LoadError } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import { formatSigned } from "@/shared/text.ts";

import { abilityName } from "./abilityName.ts";
import type { LevelAbilities } from "./levelUp/index.ts";

interface AbilityIncreaseFieldProps {
  abilities: LevelAbilities;
  baseRules: BaseRules;
  /** Its radios' group, one per field (a level's). */
  name: string;
  onChange: (abilityId: string) => void;
  /** The character's ruleset, which names its abilities. */
  rulesetId: string;
  value: string | null;
}

/** The ability a level's ability increase goes to, each with its score and modifier. */
export function AbilityIncreaseField({
  abilities,
  baseRules,
  name,
  rulesetId,
  value,
  onChange,
}: AbilityIncreaseFieldProps) {
  const { data: names, error: namesError } = useRulesetAbilities(rulesetId);
  // The radios are named by the field's label
  const labelId = useId();
  return (
    <FormControl component="fieldset" sx={{ "& .MuiFormLabel-root": { mb: 0.25 } }}>
      {/* Its abilities named by their keys meanwhile */}
      {!!namesError && !names && <LoadError what="Ability names" error={namesError} />}
      <FormLabel component="legend" id={labelId}>
        Select an ability to increase
      </FormLabel>
      <RadioGroup aria-labelledby={labelId} name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {sortAbilities(Object.entries(abilities), baseRules, ([key]) => key).map(([, ability]) => (
          <FormControlLabel
            key={ability.abilityId}
            value={ability.abilityId}
            control={<Radio />}
            label={`${abilityName(names, abilities, ability.abilityId)}: ${ability.total} (${formatSigned(ability.modifier)})`}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
