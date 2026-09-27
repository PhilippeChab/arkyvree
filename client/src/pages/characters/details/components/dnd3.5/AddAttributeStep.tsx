import type { AddAttributeStepProps } from "./levelUpFactory.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";

export function AddAttributeStep({
  wizard,
  baseRules,
}: AddAttributeStepProps) {
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
