import { Box, Typography } from "@mui/material";
import type { LevelUpReviewStepProps } from "./levelUpFactory.ts";

type ReviewSelectionsProps = Pick<
  LevelUpReviewStepProps,
  "skillPointAllocations" | "skillData" | "selectedFeats" | "featData" | "selectedPowers" | "powerData"
>;

/** The skills, feats and spells a level-up review lists, in both the Add Level and Edit Level wizards. */
export function ReviewSelections({
  skillPointAllocations,
  skillData,
  selectedFeats,
  featData,
  selectedPowers,
  powerData,
}: ReviewSelectionsProps) {
  const selectedSkills = Object.entries(skillPointAllocations).filter(
    ([, points]) => points > 0,
  );
  const selectedFeatsData = Object.values(selectedFeats).flat();
  const selectedPowersData = Object.values(selectedPowers).flat();

  return (
    <>
      {/* Skill Improvements */}
      {selectedSkills.length > 0 && (
        <Box sx={{
          mb: 3
        }}>
          <Typography variant="h6" gutterBottom>
            Skill Improvements
          </Typography>
          {selectedSkills.map(([skillId, points]) => {
            const skill = skillData?.skills.find((s) => s.id === skillId);
            if (!skill) return null;
            const ranksGained = skill.isClassSkill ? points : points * 0.5;
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
          {selectedFeatsData.map((feat, i) => (
            // A stackable feat can be picked at several levels.
            <Typography key={`${feat.id}-${i}`} variant="body1">
              <strong>{feat.name}</strong>
            </Typography>
          ))}
        </Box>
      )}
      {/* Auto-granted Feats */}
      {featData?.autoGrantedFeats && featData.autoGrantedFeats.length > 0 && (
        <Box sx={{
          mb: 3
        }}>
          <Typography variant="h6" gutterBottom>
            Auto-Granted Feats
          </Typography>
          {featData.autoGrantedFeats.map((feat, i) => (
            <Typography key={`${feat.id}-${i}`} variant="body1">
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
          {selectedPowersData.map((power, i) => (
            // A stackable power can be picked at several levels.
            <Typography key={`${power.id}-${i}`} variant="body1">
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
            {powerData.autoGrantedPowers.map((power, i) => (
              <Typography key={`${power.id}-${i}`} variant="body1">
                <strong>{power.name}</strong>
                {power.free ? " (class ability)" : ""}
              </Typography>
            ))}
          </Box>
        )}
    </>
  );
}
