import { Typography } from "@mui/material";

import { abilityName } from "@/client/src/components/characters/sections/dnd3.5/index.ts";
import { LoadError } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";

import { LevelReview, type LevelReviewState, ReviewGroup } from "./LevelReview.tsx";
import type { AbilitiesData } from "./levelUp/index.ts";

interface EditReviewState extends LevelReviewState {
  abilityData: AbilitiesData | undefined;
  selectedAbility: string | null;
}

interface EditReviewStepProps {
  rulesetId: string;
  wizard: EditReviewState;
}

export function EditReviewStep({ wizard, rulesetId }: EditReviewStepProps) {
  const { selectedAbility, abilityData } = wizard;
  const { data: names, error: namesError } = useRulesetAbilities(rulesetId);

  return (
    <LevelReview wizard={wizard}>
      {selectedAbility && (
        <ReviewGroup title="Ability Increase">
          {!!namesError && !names && <LoadError what="Ability names" error={namesError} />}
          <Typography variant="body1">
            <strong>{abilityName(names, abilityData?.attributes, selectedAbility)}</strong> +1
          </Typography>
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
