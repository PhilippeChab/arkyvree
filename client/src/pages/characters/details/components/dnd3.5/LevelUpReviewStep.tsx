import type { LevelUpReviewStepProps } from "./levelUpFactory.ts";
import { ReviewSelections } from "./ReviewSelections.tsx";
import { attributeName } from "./attributeName.ts";
import { Alert, Box, Typography } from "@mui/material";

export function LevelUpReviewStep({
  selectedClass,
  selectedHP,
  selectedAttribute,
  attributeData,
  skillPointAllocations,
  skillData,
  selectedFeats,
  featData,
  selectedPowers,
  powerData,
}: LevelUpReviewStepProps) {
  if (!selectedClass || !selectedHP) {
    return <Alert severity="error">Missing required selections.</Alert>;
  }

  return (
    <Box>
      <Typography
        gutterBottom
        sx={{ typography: { xs: "h6", sm: "h5" } }}
      >
        Review Changes
      </Typography>
      {/* Class and Level */}
      <Box sx={{
        mb: 3
      }}>
        <Typography variant="h6" gutterBottom>
          Class Advancement
        </Typography>
        <Typography variant="body1">
          <strong>{selectedClass.name}</strong> Level{" "}
          {selectedClass.nextLevel}
        </Typography>
        <Typography variant="body1">
          HP Gain: <strong>+{selectedHP}</strong>
        </Typography>
      </Box>
      {/* Attribute Increase */}
      {selectedAttribute && (
        <Box sx={{
          mb: 3
        }}>
          <Typography variant="h6" gutterBottom>
            Attribute Increase
          </Typography>
          <Typography variant="body1">
            <strong>{attributeName(attributeData, selectedAttribute)}</strong> +1
          </Typography>
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
