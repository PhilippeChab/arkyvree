import { Box, Stack } from "@mui/material";

import { BlankNote, DiceSpinner, LoadError, SubsectionTitle } from "@/client/src/components/common/index.ts";

import { AbilityIncreaseField } from "./AbilityIncreaseField.tsx";
import type { AbilitiesData, PreviewLevelDetail } from "./levelUp/index.ts";

interface AddAbilityState {
  abilitiesError: Error | null;
  abilityData: AbilitiesData | undefined;
  abilityIncreaseLevels: number[];
  abilityIncreases: (string | null)[];
  handleAbilityIncreaseChange: (index: number, abilityId: string) => void;
  isLoadingAbilities: boolean;
  levelDetails: Pick<PreviewLevelDetail, "klassName" | "level">[];
}

interface AddAbilityStepProps {
  wizard: AddAbilityState;
}

export function AddAbilityStep({ wizard }: AddAbilityStepProps) {
  const {
    abilityData,
    isLoadingAbilities,
    abilitiesError,
    abilityIncreaseLevels,
    abilityIncreases,
    handleAbilityIncreaseChange: onAbilityIncreaseChange,
    levelDetails,
  } = wizard;
  if (isLoadingAbilities) return <DiceSpinner />;
  if (abilitiesError && !abilityData) return <LoadError what="Abilities" error={abilitiesError} />;
  if (!abilityData?.isAvailable || abilityIncreaseLevels.length === 0)
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
                abilities={abilityData.attributes}
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
