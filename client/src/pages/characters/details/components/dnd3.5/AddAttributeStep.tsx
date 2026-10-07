import { Box, Stack, Typography } from "@mui/material";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";

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
  if (!attributeData?.isAvailable || abilityIncreaseLevels.length === 0)
    return <BlankNote>No attribute increase at these levels.</BlankNote>;

  return (
    <Stack spacing={1.5}>
      {abilityIncreaseLevels.map((index) => {
        const detail = levelDetails[index];
        const selected = abilityIncreases[index] ?? null;

        return (
          <Stack key={index} spacing={0.25}>
            <Typography variant="h6" component="h3">
              {detail ? `${detail.klassName} Level ${detail.level}` : `Level ${index + 1}`}
            </Typography>
            {/* The field sits on a line of the block's text, as it did under the title */}
            <Box>
              <AttributeIncreaseField
                attributes={attributeData.attributes}
                baseRules={baseRules}
                name={`attribute-increase-${index}`}
                value={selected}
                onChange={(abilityId) => onAbilityIncreaseChange(index, abilityId)}
              />
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
