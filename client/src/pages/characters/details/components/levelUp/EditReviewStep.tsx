import { Typography } from "@mui/material";

import { abilityName } from "./abilityName.ts";
import type { AbilitiesData } from "./levelAnswers.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import { useCharacterRules } from "./useCharacterRules.ts";

interface EditReviewState extends LevelReviewState {
  abilityData: AbilitiesData | undefined;
  selectedAbility: string | null;
}

interface EditReviewStepProps {
  characterId: string;
  wizard: EditReviewState;
}

export function EditReviewStep({ characterId, wizard }: EditReviewStepProps) {
  const { rules } = useCharacterRules(characterId);
  // Its rules' word for an ability increase, and what one adds
  const increase = rules?.levelUp.abilityIncrease;
  const { selectedAbility, abilityData } = wizard;

  return (
    <LevelReview wizard={wizard} rules={rules}>
      {selectedAbility && (
        <ReviewGroup title={increase?.word.one ?? ""}>
          <Typography variant="body1">
            <strong>{abilityName(abilityData, selectedAbility)}</strong> +{increase?.amount}
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
