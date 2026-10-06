import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { formatCount } from "@/client/src/lib/formatNumeric.ts";

import type { LevelReviewState } from "./levelUpFactory.ts";

interface LevelReviewProps {
  wizard: LevelReviewState;
  /** The wizard's own groups (classes, HP, attributes), listed first. */
  children: ReactNode;
}

interface ReviewGroupProps {
  title: string;
  children: ReactNode;
}

interface ReviewItemProps {
  name: string;
  note?: string;
}

/** A named pick of the review ("Power Attack"). */
function ReviewItem({ name, note }: ReviewItemProps) {
  return (
    <Typography>
      <strong>{name}</strong>
      {note}
    </Typography>
  );
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
    <Stack spacing={3}>
      <Typography component="h3" variant="h6">
        Review Changes
      </Typography>
      {children}
      {selectedSkills.length > 0 && (
        <ReviewGroup title="Skill Improvements">
          <Stack spacing={1}>
            <Box>
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
            </Box>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Total Points Used: {pointsUsed} / {skillData?.skillPointsToSpend}
            </Typography>
          </Stack>
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
    </Stack>
  );
}

/** A titled group of a level review ("Class Advancement", "New Feats"). */
export function ReviewGroup({ title, children }: ReviewGroupProps) {
  return (
    <Box>
      <Typography component="h3" variant="h6" gutterBottom>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
