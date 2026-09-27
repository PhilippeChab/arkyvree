import type { AddReviewStepProps } from "./levelUpFactory.ts";
import { ReviewSelections } from "./ReviewSelections.tsx";
import { Box, Typography } from "@mui/material";

export function AddReviewStep({
  classPlan,
  hpValues,
  abilityIncreases,
  attributeData,
  skillPointAllocations,
  skillData,
  selectedFeats,
  featData,
  selectedPowers,
  powerData,
}: AddReviewStepProps) {
  return (
    <Box>
      <Typography gutterBottom sx={{ typography: { xs: "h6", sm: "h5" } }}>
        Review Changes
      </Typography>
      {/* Class Advancement */}
      <Box sx={{
        mb: 3
      }}>
        <Typography variant="h6" gutterBottom>
          Class Advancement
        </Typography>
        {classPlan.map((klass, i) =>
          klass ? (
            <Typography key={i} variant="body1">
              <strong>{klass.name}</strong> Level {klass.nextLevel}
              {hpValues[i] != null && <> — HP: +{hpValues[i]}</>}
            </Typography>
          ) : null,
        )}
      </Box>
      {/* Attribute Increases */}
      {Object.keys(abilityIncreases).length > 0 &&
        Object.values(abilityIncreases).some((v) => v != null) && (
          <Box sx={{
            mb: 3
          }}>
            <Typography variant="h6" gutterBottom>
              Attribute Increases
            </Typography>
            {Object.entries(abilityIncreases).map(([index, abilityId]) => {
              if (!abilityId) return null;
              const entry = Object.entries(
                attributeData?.attributes ?? {},
              ).find(([, v]) => v.abilityId === abilityId);
              const name = entry
                ? entry[0].charAt(0).toUpperCase() + entry[0].slice(1)
                : abilityId;
              return (
                <Typography key={index} variant="body1">
                  <strong>{name}</strong> +1
                </Typography>
              );
            })}
          </Box>
        )}
      <ReviewSelections
        skillPointAllocations={skillPointAllocations}
        skillData={skillData}
        selectedFeats={selectedFeats}
        featData={featData}
        selectedPowers={selectedPowers}
        powerData={powerData}
      />
    </Box>
  );
}
