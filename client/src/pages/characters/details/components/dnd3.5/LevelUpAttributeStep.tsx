import type { LevelUpAttributeStepProps } from "./levelUpFactory.ts";
import type { LeveledUpAttribute } from "./levelUp/useLevelWizard.ts";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Alert, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from "@mui/material";

export function LevelUpAttributeStep({
  attributeData,
  isLoadingAttributes,
  attributesError,
  selectedAttribute,
  baseRules,
  setValue,
}: LevelUpAttributeStepProps) {
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError)
    return <Alert severity="error">Error loading attributes.</Alert>;
  if (!attributeData?.isAvailable) {
    return (
      <Alert severity="info">No attribute increase at this level.</Alert>
    );
  }

  return (
    <FormControl component="fieldset">
      <FormLabel component="legend">
        Select an attribute to increase
      </FormLabel>
      <RadioGroup
        aria-label="attribute"
        name="attribute"
        value={selectedAttribute || ""}
        onChange={(e) => setValue("selectedAttribute", e.target.value)}
      >
        {sortAbilities(
          Object.entries(attributeData.attributes),
          baseRules,
          ([key]) => key,
        ).map(([key, value]: [string, LeveledUpAttribute[string]]) => {
          const modifier = Math.floor((value.total - 10) / 2);
          const capitalizedKey =
            key.charAt(0).toUpperCase() + key.slice(1);
          return (
            <FormControlLabel
              key={value.abilityId}
              value={value.abilityId}
              control={<Radio />}
              label={`${capitalizedKey}: ${value.total} (${
                modifier >= 0 ? "+" : ""
              }${modifier})`}
            />
          );
        })}
      </RadioGroup>
    </FormControl>
  );
}
