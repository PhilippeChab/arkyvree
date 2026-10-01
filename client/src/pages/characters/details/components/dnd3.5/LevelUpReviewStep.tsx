import { Alert, Typography } from "@mui/material";

import { attributeName } from "./attributeName.ts";
import { LevelReview, ReviewGroup } from "./LevelReview.tsx";
import type { LevelUpReviewStepProps } from "./levelUpFactory.ts";

export function LevelUpReviewStep({ wizard }: LevelUpReviewStepProps) {
  const { selectedClass, selectedHP, selectedAttribute, attributeData } = wizard;
  if (!selectedClass || !selectedHP) {
    return <Alert severity="error">Missing required selections.</Alert>;
  }

  return (
    <LevelReview wizard={wizard}>
      <ReviewGroup title="Class Advancement">
        <Typography variant="body1">
          <strong>{selectedClass.name}</strong> Level {selectedClass.nextLevel}
        </Typography>
        <Typography variant="body1">
          HP Gain: <strong>+{selectedHP}</strong>
        </Typography>
      </ReviewGroup>
      {selectedAttribute && (
        <ReviewGroup title="Attribute Increase">
          <Typography variant="body1">
            <strong>{attributeName(attributeData, selectedAttribute)}</strong> +1
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
