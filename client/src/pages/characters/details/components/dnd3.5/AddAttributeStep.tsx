import type { AddAttributeStepProps } from "./levelUpFactory.ts";
import type { LeveledUpAttribute } from "./levelUp/useLevelWizard.ts";
import { sortAbilities } from "@/client/src/lib/abilityOrder.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from "@mui/material";

export function AddAttributeStep({
  attributeData,
  isLoadingAttributes,
  attributesError,
  abilityIncreaseLevels,
  abilityIncreases,
  onAbilityIncreaseChange,
  levelDetails,
  baseRules,
}: AddAttributeStepProps) {
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError)
    return <Alert severity="error">Error loading attributes.</Alert>;
  if (!attributeData?.isAvailable || abilityIncreaseLevels.length === 0) {
    return (
      <Alert severity="info">No attribute increase at these levels.</Alert>
    );
  }

  return (
    <Stack spacing={1.5}>
      {abilityIncreaseLevels.map((index) => {
        const detail = levelDetails[index];
        const selected = abilityIncreases[index] ?? null;

        return (
          <Box key={index}>
            <Typography variant="h6" sx={{ mb: 0.25 }}>
              {detail
                ? `${detail.klassName} Level ${detail.level}`
                : `Level ${index + 1}`}
            </Typography>
            <FormControl component="fieldset" sx={{ "& .MuiFormLabel-root": { mb: 0.25 } }}>
              <FormLabel component="legend">
                Select an attribute to increase
              </FormLabel>
              <RadioGroup
                aria-label={`attribute-increase-${index}`}
                name={`attribute-increase-${index}`}
                value={selected ?? ""}
                onChange={(e) =>
                  onAbilityIncreaseChange(index, e.target.value)
                }
              >
                {sortAbilities(
                  Object.entries(attributeData.attributes),
                  baseRules,
                  ([key]) => key,
                ).map(
                  ([key, value]: [string, LeveledUpAttribute[string]]) => {
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
                  },
                )}
              </RadioGroup>
            </FormControl>
          </Box>
        );
      })}
    </Stack>
  );
}
