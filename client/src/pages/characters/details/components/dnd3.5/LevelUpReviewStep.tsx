import { Typography } from "@mui/material";

import { attributeName } from "./attributeName.ts";
import { LevelReview, ReviewGroup } from "./LevelReview.tsx";
import type { LevelUpReviewStepProps } from "./levelUpFactory.ts";

export function LevelUpReviewStep({ wizard }: LevelUpReviewStepProps) {
  const { selectedClass, selectedHP, selectedAttribute, attributeData } = wizard;
  // The steps before it can't be passed without a class and its HP
  if (!selectedClass || !selectedHP) return null;

  return (
    <LevelReview wizard={wizard}>
      <ReviewGroup title="Class Advancement">
        <Typography>
          <strong>{selectedClass.name}</strong> Level {selectedClass.nextLevel}
        </Typography>
        <Typography>
          HP Gain: <strong>+{selectedHP}</strong>
        </Typography>
      </ReviewGroup>
      {selectedAttribute && (
        <ReviewGroup title="Attribute Increase">
          <Typography>
            <strong>{attributeName(attributeData, selectedAttribute)}</strong> +1
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
