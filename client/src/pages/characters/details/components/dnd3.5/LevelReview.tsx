import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { SubsectionTitle } from "@/client/src/components/common/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";

import { skillRanks } from "./levelUp/index.ts";
import type { LevelReviewState } from "./levelUpFactory.ts";

interface LevelReviewProps {
  /** The wizard's own groups (classes, HP, attributes), listed first. */
  children: ReactNode;
  wizard: LevelReviewState;
}

interface ReviewGroupProps {
  children: ReactNode;
  title: string;
}

interface ReviewItemProps {
  name: string;
  note?: string;
}

/** A named pick of the review ("Power Attack"). */
function ReviewItem({ name, note }: ReviewItemProps) {
  return (
    <Typography variant="body1">
      <strong>{name}</strong>
      {note}
    </Typography>
  );
}

/** The last step of the Add Level and Edit Level wizards: the wizard's groups, then the skills, feats and spells picked. */
export function LevelReview({ wizard, children }: LevelReviewProps) {
  const { skillPointAllocations, skillData, skillLevels, selectedFeats, featData, selectedPowers, powerData } = wizard;
  const selectedSkills = Object.entries(skillPointAllocations).filter(([, points]) => points > 0);
  const pointsUsed = Object.values(skillPointAllocations).reduce((sum, points) => sum + points, 0);
  const selectedFeatsData = Object.values(selectedFeats).flat();
  const selectedPowersData = Object.values(selectedPowers).flat();
  const autoGrantedFeats = featData?.autoGrantedFeats ?? [];
  const autoGrantedPowers = powerData?.autoGrantedPowers ?? [];

  return (
    // The review's own space under its last group, at the end of the wizard's scroll
    <Stack spacing={1} sx={{ pb: 3 }}>
      <SubsectionTitle>Review Changes</SubsectionTitle>
      <Stack spacing={3}>
        {children}
        {selectedSkills.length > 0 && (
          <ReviewGroup title="Skill Improvements">
            <Stack spacing={1}>
              <Box>
                {selectedSkills.map(([skillId, points]) => {
                  const skill = skillData?.skills.find((s) => s.id === skillId);
                  if (!skill || !skillLevels) return null;
                  // As the skills step and the server count them: by the levels the points go to
                  const ranksGained = skillRanks(skillId, points, skillLevels);
                  return (
                    <ReviewItem
                      key={skillId}
                      name={skill.name}
                      note={`: +${formatCount(ranksGained, "rank")}${ranksGained === points ? "" : ` (${formatCount(points, "point")})`}`}
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
              <ReviewItem
                key={`${power.id}-${i}`}
                name={power.name}
                note={power.free ? " (class ability)" : undefined}
              />
            ))}
          </ReviewGroup>
        )}
      </Stack>
    </Stack>
  );
}

/** A titled group of a level review ("Class Advancement", "New Feats"). */
export function ReviewGroup({ title, children }: ReviewGroupProps) {
  return (
    <Stack spacing={1}>
      <SubsectionTitle component="h4">{title}</SubsectionTitle>
      {children}
    </Stack>
  );
}
