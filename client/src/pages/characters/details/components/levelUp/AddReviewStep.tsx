import { Typography } from "@mui/material";

import { abilityName } from "./abilityName.ts";
import type { AbilitiesData } from "./levelAnswers.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import { useCharacterRules } from "./useCharacterRules.ts";

interface AddReviewState extends LevelReviewState {
  abilityData: AbilitiesData | undefined;
  abilityIncreases: (string | null)[];
}

interface AddReviewStepProps {
  characterId: string;
  wizard: AddReviewState;
}

export function AddReviewStep({ characterId, wizard }: AddReviewStepProps) {
  const { rules } = useCharacterRules(characterId);
  // Its rules' word for an ability increase, and what one adds
  const increase = rules?.levelUp.abilityIncrease;
  const { abilityIncreases, abilityData } = wizard;
  const increases = Object.entries(abilityIncreases).filter((entry): entry is [string, string] => entry[1] != null);

  return (
    <LevelReview wizard={wizard} rules={rules}>
      {increases.length > 0 && (
        <ReviewGroup title={increase?.word.many ?? ""}>
          {increases.map(([index, abilityId]) => (
            <Typography key={index} variant="body1">
              <strong>{abilityName(abilityData, abilityId)}</strong> +{increase?.amount}
            </Typography>
          ))}
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
