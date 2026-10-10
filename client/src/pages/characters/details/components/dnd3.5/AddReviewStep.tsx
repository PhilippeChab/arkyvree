import { Typography } from "@mui/material";

import { abilityName } from "./abilityName.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AttributesData } from "./levelUp/index.ts";

interface AddReviewState extends LevelReviewState {
  abilityIncreases: (string | null)[];
  attributeData: AttributesData | undefined;
}

interface AddReviewStepProps {
  wizard: AddReviewState;
}

export function AddReviewStep({ wizard }: AddReviewStepProps) {
  const { abilityIncreases, attributeData } = wizard;
  const increases = Object.entries(abilityIncreases).filter((entry): entry is [string, string] => entry[1] != null);

  return (
    <LevelReview wizard={wizard}>
      {increases.length > 0 && (
        <ReviewGroup title="Ability Increases">
          {increases.map(([index, abilityId]) => (
            <Typography key={index} variant="body1">
              <strong>{abilityName(attributeData, abilityId)}</strong> +1
            </Typography>
          ))}
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
