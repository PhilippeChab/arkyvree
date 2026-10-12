import { Typography } from "@mui/material";

import { LoadError } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";

import { abilityName } from "./abilityName.ts";
import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AttributesData } from "./levelUp/index.ts";

interface AddReviewState extends LevelReviewState {
  abilityIncreases: (string | null)[];
  attributeData: AttributesData | undefined;
}

interface AddReviewStepProps {
  rulesetId: string;
  wizard: AddReviewState;
}

export function AddReviewStep({ wizard, rulesetId }: AddReviewStepProps) {
  const { abilityIncreases, attributeData } = wizard;
  const { data: names, error: namesError } = useRulesetAbilities(rulesetId);
  const increases = Object.entries(abilityIncreases).filter((entry): entry is [string, string] => entry[1] != null);

  return (
    <LevelReview wizard={wizard}>
      {increases.length > 0 && (
        <ReviewGroup title="Ability Increases">
          {!!namesError && !names && <LoadError what="Ability names" error={namesError} />}
          {increases.map(([index, abilityId]) => (
            <Typography key={index} variant="body1">
              <strong>{abilityName(names, attributeData?.attributes, abilityId)}</strong> +1
            </Typography>
          ))}
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
