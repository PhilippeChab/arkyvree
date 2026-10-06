import { Typography } from "@mui/material";

import { attributeName } from "./attributeName.ts";
import { LevelReview, ReviewGroup } from "./LevelReview.tsx";
import type { AddReviewStepProps } from "./levelUpFactory.ts";

export function AddReviewStep({ wizard }: AddReviewStepProps) {
  const { classPlan, hpValues, abilityIncreases, attributeData } = wizard;
  const increases = Object.entries(abilityIncreases).filter((entry): entry is [string, string] => entry[1] != null);

  return (
    <LevelReview wizard={wizard}>
      <ReviewGroup title="Class Advancement">
        {/* HP is kept per planned level; empty slots don't count. */}
        {classPlan
          .filter((klass) => klass !== null)
          .map((klass, i) => (
            <Typography key={i}>
              <strong>{klass.name}</strong> Level {klass.nextLevel}
              {hpValues[i] != null && <> — HP: +{hpValues[i]}</>}
            </Typography>
          ))}
      </ReviewGroup>
      {increases.length > 0 && (
        <ReviewGroup title="Attribute Increases">
          {increases.map(([index, abilityId]) => (
            <Typography key={index}>
              <strong>{attributeName(attributeData, abilityId)}</strong> +1
            </Typography>
          ))}
        </ReviewGroup>
      )}
    </LevelReview>
  );
}
