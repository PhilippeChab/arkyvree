import { Box, Stack } from "@mui/material";

import { BlankNote, DiceSpinner, LoadError, SubsectionTitle } from "@/client/src/components/common/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AttributeIncreaseField } from "./AttributeIncreaseField.tsx";
import type { AttributesData, PreviewLevelDetail } from "./levelUp/index.ts";

interface AddAttributeState {
  abilityIncreaseLevels: number[];
  abilityIncreases: Record<number, string | null>;
  attributeData: AttributesData | undefined;
  attributesError: Error | null;
  handleAbilityIncreaseChange: (index: number, abilityId: string) => void;
  isLoadingAttributes: boolean;
  levelDetails: Pick<PreviewLevelDetail, "klassName" | "level">[];
}

export interface AddAttributeStepProps {
  baseRules: BaseRules;
  wizard: AddAttributeState;
}

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
  if (attributesError && !attributeData) return <LoadError what="Attributes" error={attributesError} />;
  if (!attributeData?.isAvailable || abilityIncreaseLevels.length === 0)
    return <BlankNote>No attribute increase at these levels</BlankNote>;

  return (
    <Stack spacing={1.5}>
      {abilityIncreaseLevels.map((index) => {
        const detail = levelDetails[index];
        const selected = abilityIncreases[index] ?? null;

        return (
          <Stack key={index} spacing={1}>
            <SubsectionTitle>
              {detail ? `${detail.klassName} Level ${detail.level}` : `Level ${index + 1}`}
            </SubsectionTitle>
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
