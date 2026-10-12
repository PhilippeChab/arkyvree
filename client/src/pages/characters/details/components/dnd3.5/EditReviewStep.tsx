import { Typography } from "@mui/material";

import { abilityName } from "./abilityName.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AbilitiesData } from "./levelUp/index.ts";

interface EditReviewState extends LevelReviewState {
  abilityData: AbilitiesData | undefined;
  selectedAbility: string | null;
}

interface EditReviewStepProps {
  wizard: EditReviewState;
}

export function EditReviewStep({ wizard }: EditReviewStepProps) {
  const { selectedAbility, abilityData } = wizard;

  return (
    <LevelReview wizard={wizard}>
      {selectedAbility && (
        <ReviewGroup title="Ability Increase">
          <Typography variant="body1">
            <strong>{abilityName(abilityData, selectedAbility)}</strong> +1
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
