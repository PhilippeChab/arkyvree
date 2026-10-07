import { Alert, Typography } from "@mui/material";

import { attributeName } from "./attributeName.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AttributesData, SelectedKlass } from "./levelUp/index.ts";

interface EditReviewState extends LevelReviewState {
  attributeData: AttributesData | undefined;
  selectedAttribute: string | null;
  selectedClass: SelectedKlass | null;
  selectedHP: number | null;
}

export interface EditReviewStepProps {
  wizard: EditReviewState;
}

export function EditReviewStep({ wizard }: EditReviewStepProps) {
  const { selectedClass, selectedHP, selectedAttribute, attributeData } = wizard;
  if (!selectedClass || !selectedHP) return <Alert severity="error">Missing required selections.</Alert>;

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
