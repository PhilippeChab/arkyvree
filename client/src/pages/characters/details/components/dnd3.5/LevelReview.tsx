import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { LevelReviewState } from "./levelUpFactory.ts";

/** A titled group of a level review ("Class Advancement", "New Feats"). */
export function ReviewGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/** A named pick of the review ("Power Attack"). */
function ReviewItem({ name, note }: { name: string; note?: string }) {
  return (
    <Typography variant="body1">
      <strong>{name}</strong>
      {note}
    </Typography>
  );
}

interface LevelReviewProps {
  wizard: LevelReviewState;
  /** The wizard's own groups (classes, HP, attributes), listed first. */
  children: ReactNode;
}

/** The last step of the Add Level and Edit Level wizards: the wizard's groups, then the skills, feats and spells picked. */
export function LevelReview({ wizard, children }: LevelReviewProps) {
  const { skillPointAllocations, skillData, selectedFeats, featData, selectedPowers, powerData } = wizard;
  const selectedSkills = Object.entries(skillPointAllocations).filter(([, points]) => points > 0);
  const pointsUsed = Object.values(skillPointAllocations).reduce((sum, points) => sum + points, 0);
  const selectedFeatsData = Object.values(selectedFeats).flat();
  const selectedPowersData = Object.values(selectedPowers).flat();
  const autoGrantedFeats = featData?.autoGrantedFeats ?? [];
  const autoGrantedPowers = powerData?.autoGrantedPowers ?? [];

  return (
    <Box>
      <Typography gutterBottom sx={{ typography: { xs: "h6", sm: "h5" } }}>
        Review Changes
      </Typography>
      {children}
      {selectedSkills.length > 0 && (
        <ReviewGroup title="Skill Improvements">
          {selectedSkills.map(([skillId, points]) => {
            const skill = skillData?.skills.find((s) => s.id === skillId);
            if (!skill) return null;
            const ranksGained = skill.isClassSkill ? points : points * 0.5;
            return (
              <ReviewItem
                key={skillId}
                name={skill.name}
                note={`: +${formatCount(ranksGained, "rank")}${skill.isClassSkill ? "" : ` (${formatCount(points, "point")})`}`}
              />
            );
          })}
          <Typography variant="body2" sx={{ mt: 1, color: "text.secondary" }}>
            Total Points Used: {pointsUsed} / {skillData?.skillPointsToSpend}
          </Typography>
        </ReviewGroup>
      )}
      {selectedFeatsData.length > 0 && (
        <ReviewGroup title="New Feats">
          {selectedFeatsData.map((feat, i) => (
            // A stackable feat can be picked at several levels.
            <ReviewItem key={`${feat.id}-${i}`} name={feat.name} />
          ))}
        </ReviewGroup>
      )}
      {autoGrantedFeats.length > 0 && (
        <ReviewGroup title="Auto-Granted Feats">
          {autoGrantedFeats.map((feat, i) => (
            <ReviewItem key={`${feat.id}-${i}`} name={feat.name} />
          ))}
        </ReviewGroup>
      )}
      {selectedPowersData.length > 0 && (
        <ReviewGroup title="New Spells">
          {selectedPowersData.map((power, i) => (
            // A stackable power can be picked at several levels.
            <ReviewItem key={`${power.id}-${i}`} name={power.name} />
          ))}
        </ReviewGroup>
      )}
      {autoGrantedPowers.length > 0 && (
        <ReviewGroup title="Auto-Granted Spells">
          {autoGrantedPowers.map((power, i) => (
            <ReviewItem key={`${power.id}-${i}`} name={power.name} note={power.free ? " (class ability)" : undefined} />
          ))}
        </ReviewGroup>
      )}
    </Box>
  );
}
