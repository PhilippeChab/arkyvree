import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from "@mui/material";

import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { computeAbilityModifier } from "@/shared/dnd3.5/abilities.ts";
import { capitalize } from "@/shared/text.ts";

import type { BaseRules, LeveledUpAttribute } from "./levelUp/index.ts";

interface AttributeIncreaseFieldProps {
  attributes: LeveledUpAttribute;
  baseRules: BaseRules;
  name: string;
  value: string | null;
  onChange: (abilityId: string) => void;
}

/** The ability a level's attribute increase goes to, each with its score and modifier. */
export function AttributeIncreaseField({ attributes, baseRules, name, value, onChange }: AttributeIncreaseFieldProps) {
  return (
    <FormControl component="fieldset">
      <FormLabel component="legend">Select an attribute to increase</FormLabel>
      <RadioGroup aria-label={name} name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {sortAbilities(Object.entries(attributes), baseRules, ([key]) => key).map(([key, attribute]) => (
          <FormControlLabel
            key={attribute.abilityId}
            value={attribute.abilityId}
            control={<Radio />}
            label={`${capitalize(key)}: ${attribute.total} (${formatSigned(computeAbilityModifier(attribute.total))})`}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
