import { Box, Stack, Typography } from "@mui/material";

import { BlankState, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import { AbilitiesIcon } from "@/client/src/components/icons/index.ts";

import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";
import type { AddAttributeStepProps } from "./levelUpFactory.ts";

export function AddAttributeStep({ wizard, baseRules }: AddAttributeStepProps) {
  const {
    attributeData,
    isLoadingAttributes,
    attributesError,
    abilityIncreaseLevels,
    abilityIncreases,
    handleAbilityIncreaseChange: onAbilityIncreaseChange,
    levelDetails,
  } = wizard;
  if (isLoadingAttributes) return <DiceSpinner />;
  if (attributesError) return <LoadError what="Attributes" error={attributesError} />;
  if (!attributeData?.isAvailable || abilityIncreaseLevels.length === 0) {
    return <BlankState icon={AbilitiesIcon} title="No attribute increase at these levels" />;
  }

  return (
    <Stack spacing={3}>
      {abilityIncreaseLevels.map((index) => {
        const detail = levelDetails[index];
        const selected = abilityIncreases[index] ?? null;

        return (
          <Box key={index}>
            <Typography component="h3" variant="h6" gutterBottom>
              {detail ? `${detail.klassName} Level ${detail.level}` : `Level ${index + 1}`}
            </Typography>
            <AttributeIncreaseField
              attributes={attributeData.attributes}
              baseRules={baseRules}
              name={`attribute-increase-${index}`}
              value={selected}
              onChange={(abilityId) => onAbilityIncreaseChange(index, abilityId)}
            />
          </Box>
        );
      })}
    </Stack>
  );
}
