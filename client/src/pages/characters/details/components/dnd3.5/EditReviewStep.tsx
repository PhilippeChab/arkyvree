import { Typography } from "@mui/material";

import { LoadError } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";

import { abilityName } from "./abilityName.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AttributesData } from "./levelUp/index.ts";

interface EditReviewState extends LevelReviewState {
  attributeData: AttributesData | undefined;
  selectedAttribute: string | null;
}

interface EditReviewStepProps {
  rulesetId: string;
  wizard: EditReviewState;
}

export function EditReviewStep({ wizard, rulesetId }: EditReviewStepProps) {
  const { selectedAttribute, attributeData } = wizard;
  const { data: names, error: namesError } = useRulesetAbilities(rulesetId);

  return (
    <LevelReview wizard={wizard}>
      {selectedAttribute && (
        <ReviewGroup title="Ability Increase">
          {!!namesError && !names && <LoadError what="Ability names" error={namesError} />}
          <Typography variant="body1">
            <strong>{abilityName(names, attributeData?.attributes, selectedAttribute)}</strong> +1
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
