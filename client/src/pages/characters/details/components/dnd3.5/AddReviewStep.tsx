import type { AddReviewStepProps } from "./levelUpFactory.ts";
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
  const selectedSkills = Object.entries(skillPointAllocations).filter(
    ([, points]) => points > 0,
  );
  const selectedFeatsData = Object.values(selectedFeats).flat();
  const selectedPowersData = Object.values(selectedPowers).flat();

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
          {selectedFeatsData.map((feat) => (
            <Typography key={feat.id} variant="body1">
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
            {powerData.autoGrantedPowers.map((power, i) => (
              <Typography key={`${power.id}-${i}`} variant="body1">
                <strong>{power.name}</strong>
                {power.free ? " (class ability)" : ""}
              </Typography>
            ))}
          </Box>
        )}
    </Box>
  );
}
