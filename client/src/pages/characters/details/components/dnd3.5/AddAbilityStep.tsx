import { Box, Stack } from "@mui/material";

import { BlankNote, DiceSpinner, LoadError, SubsectionTitle } from "@/client/src/components/common/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AbilityIncreaseField } from "./AbilityIncreaseField.tsx";
import type { AttributesData, PreviewLevelDetail } from "./levelUp/index.ts";

interface AddAbilityState {
  abilityIncreaseLevels: number[];
  abilityIncreases: (string | null)[];
  attributeData: AttributesData | undefined;
  attributesError: Error | null;
  handleAbilityIncreaseChange: (index: number, abilityId: string) => void;
  isLoadingAttributes: boolean;
  levelDetails: Pick<PreviewLevelDetail, "klassName" | "level">[];
}

export interface AddAbilityStepProps {
  baseRules: BaseRules;
  wizard: AddAbilityState;
}

export function AddAbilityStep({ wizard, baseRules }: AddAbilityStepProps) {
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
  if (attributesError && !attributeData) return <LoadError what="Abilities" error={attributesError} />;
  if (!attributeData?.isAvailable || abilityIncreaseLevels.length === 0)
    return <BlankNote>No ability increase at these levels</BlankNote>;

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
            {/* The field on a line of its own, under the level's title */}
            <Box>
              <AbilityIncreaseField
                abilities={attributeData.attributes}
                baseRules={baseRules}
                name={`ability-increase-${index}`}
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
