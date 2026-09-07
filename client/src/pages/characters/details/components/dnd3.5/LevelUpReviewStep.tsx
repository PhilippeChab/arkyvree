import type { LevelUpReviewStepProps } from "./levelUpFactory.ts";
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

  const selectedSkills = Object.entries(skillPointAllocations).filter(
    ([, points]) => points > 0,
  );
  const selectedFeatsData = Object.values(selectedFeats).flat();
  const selectedPowersData = Object.values(selectedPowers).flat();

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
      {selectedAttribute &&
        (() => {
          const attributeEntry = Object.entries(
            attributeData?.attributes ?? {},
          ).find(([, v]) => v.abilityId === selectedAttribute);
          const attributeName = attributeEntry
            ? attributeEntry[0].charAt(0).toUpperCase() +
              attributeEntry[0].slice(1)
            : selectedAttribute;

          return (
            <Box sx={{
              mb: 3
            }}>
              <Typography variant="h6" gutterBottom>
                Attribute Increase
              </Typography>
              <Typography variant="body1">
                <strong>{attributeName}</strong> +1
              </Typography>
            </Box>
          );
        })()}
      {/* Skill Improvements */}
      {selectedSkills.length > 0 && (
        <Box sx={{
          mb: 3
        }}>
          <Typography variant="h6" gutterBottom>
            Skill Improvements
          </Typography>
          {selectedSkills.map(([skillId, points]) => {
            const skill = skillData?.skills.find(
              (s) => s.id === skillId,
            );
            if (!skill) return null;
            const ranksGained = skill.isClassSkill
              ? points
              : points * 0.5;
            return (
              <Typography key={skillId} variant="body1">
                <strong>{skill.name}</strong>: +{ranksGained} rank
                {ranksGained !== 1 ? "s" : ""}
                {!skill.isClassSkill && ` (${points} points)`}
              </Typography>
            );
          })}
          <Typography variant="body2" color="textSecondary" sx={{
            mt: 1
          }}>
            Total Points Used:{" "}
            {Object.values(skillPointAllocations).reduce(
              (sum, points) => sum + points,
              0,
            )}{" "}
            / {skillData?.skillPointsToSpend}
          </Typography>
        </Box>
      )}
      {/* Selected Feats */}
      {selectedFeatsData.length > 0 && (
        <Box sx={{
          mb: 3
        }}>
          <Typography variant="h6" gutterBottom>
            New Feats
          </Typography>
          {selectedFeatsData.map((feat) => (
            <Typography key={feat.id} variant="body1">
              <strong>{feat.name}</strong>
            </Typography>
          ))}
        </Box>
      )}
      {/* Auto-granted Feats */}
      {featData?.autoGrantedFeats &&
        featData.autoGrantedFeats.length > 0 && (
          <Box sx={{
            mb: 3
          }}>
            <Typography variant="h6" gutterBottom>
              Auto-Granted Feats
            </Typography>
            {featData.autoGrantedFeats.map((feat) => (
              <Typography key={feat.id} variant="body1">
                <strong>{feat.name}</strong>
              </Typography>
            ))}
          </Box>
        )}
      {/* Selected Spells */}
      {selectedPowersData.length > 0 && (
        <Box sx={{
          mb: 3
        }}>
          <Typography variant="h6" gutterBottom>
            New Spells
          </Typography>
          {selectedPowersData.map((power) => (
            <Typography key={power.id} variant="body1">
              <strong>{power.name}</strong>
            </Typography>
          ))}
        </Box>
      )}
      {/* Auto-granted Spells */}
      {powerData?.autoGrantedPowers &&
        powerData.autoGrantedPowers.length > 0 && (
          <Box sx={{
            mb: 3
          }}>
            <Typography variant="h6" gutterBottom>
              Auto-Granted Spells
            </Typography>
            {powerData.autoGrantedPowers.map((power) => (
              <Typography key={power.id} variant="body1">
                <strong>{power.name}</strong>
                {power.free ? " (class ability)" : ""}
              </Typography>
            ))}
          </Box>
        )}
    </Box>
  );
}
