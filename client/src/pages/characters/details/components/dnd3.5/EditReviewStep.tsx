import { Typography } from "@mui/material";

import { abilityName } from "./abilityName.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AttributesData } from "./levelUp/index.ts";

interface EditReviewState extends LevelReviewState {
  attributeData: AttributesData | undefined;
  selectedAttribute: string | null;
}

interface EditReviewStepProps {
  wizard: EditReviewState;
}

export function EditReviewStep({ wizard }: EditReviewStepProps) {
  const { selectedAttribute, attributeData } = wizard;

  return (
    <LevelReview wizard={wizard}>
      {selectedAttribute && (
        <ReviewGroup title="Ability Increase">
          <Typography variant="body1">
            <strong>{abilityName(attributeData, selectedAttribute)}</strong> +1
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
