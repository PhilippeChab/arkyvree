import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { SubsectionTitle } from "@/client/src/components/common/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";

import { freeGrantNote } from "./freeGrantNote.ts";
import type { HpLevel } from "./hitPoints.ts";
import type { FeatsData, PowersData, SkillsData } from "./levelAnswers.ts";
import { ranksAt } from "./skillRanks.ts";
import type { LevelUpFormData } from "./useLevelWizardBase.ts";

interface LevelReviewProps {
  /** The wizard's own groups (its ability increases), listed after its levels. */
  children: ReactNode;
  /** The character's rules: their words for what it picks, and its level wizard's */
  rules: RulesDescription | undefined;
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

/** The levels and their hit points, the skills, feats and spells picked, as every level review lists them. */
export interface LevelReviewState {
  featData: FeatsData | null | undefined;
  /** The levels the wizard adds or edits, as its HP step sets them. */
  hpLevels: HpLevel[];
  hpValues: (number | null)[];
  powerData: PowersData | null | undefined;
  selectedFeats: LevelUpFormData["selectedFeats"];
  selectedPowers: LevelUpFormData["selectedPowers"];
  /** The points to spend, and each skill's spending, which the skills step reads too. */
  skillData: SkillsData | null | undefined;
  skillPointAllocations: Record<string, number>;
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

/**
 * The last step of the Add Level and Edit Level wizards: the levels and their hit points, the wizard's own groups, then
 * the skills, feats and spells picked.
 */
export function LevelReview({ wizard, children, rules }: LevelReviewProps) {
  const { hpLevels, hpValues, skillPointAllocations, skillData, selectedFeats, featData, selectedPowers, powerData } =
    wizard;
  // Its rules' words for what it picks ("Spells"), and for what a skill point buys ("ranks")
  const [feats, powers] = [entityTypeLabel("feats", rules?.words, true), entityTypeLabel("powers", rules?.words, true)];
  const pointSpend = rules?.levelUp.pointSpend;
  const countUnits = (count: number) =>
    `${count} ${(count === 1 ? pointSpend?.unit.one : pointSpend?.unit.many)?.toLowerCase()}`;
  const selectedSkills = Object.entries(skillPointAllocations).filter(([, points]) => points > 0);
  const spent = pointsSpent(skillPointAllocations);
  const selectedFeatsData = Object.values(selectedFeats).flat();
  const selectedPowersData = Object.values(selectedPowers).flat();
  const autoGrantedFeats = featData?.autoGrantedFeats ?? [];
  const autoGrantedPowers = powerData?.autoGrantedPowers ?? [];

  return (
    // The review's own space under its last group, at the end of the wizard's scroll
    <Stack spacing={1} sx={{ pb: 3 }}>
      <SubsectionTitle>Review Changes</SubsectionTitle>
      <Stack spacing={3}>
        <ReviewGroup title="Class Advancement">
          {hpLevels.map((level, i) => (
            <Typography key={i} variant="body1">
              <strong>{level.className}</strong> Level {level.nextLevel}
              {hpValues[i] != null && <> — HP Gain: +{hpValues[i]}</>}
            </Typography>
          ))}
        </ReviewGroup>
        {children}
        {selectedSkills.length > 0 && pointSpend && (
          <ReviewGroup title={pointSpend.review}>
            <Stack spacing={1}>
              <Box>
                {selectedSkills.map(([skillId, points]) => {
                  const skill = skillData?.skills.find((s) => s.id === skillId);
                  if (!skill) return null;
                  // As the skills step shows them: what the server spreads the points to
                  const ranksGained = ranksAt(skill, points);
                  return (
                    <ReviewItem
                      key={skillId}
                      name={skill.name}
                      note={`: +${countUnits(ranksGained)}${ranksGained === points ? "" : ` (${formatCount(points, "point")})`}`}
                    />
                  );
                })}
              </Box>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {formatPointsSpent(spent, skillData?.skillPointsToSpend ?? 0)}
              </Typography>
            </Stack>
          </ReviewGroup>
        )}
        {selectedFeatsData.length > 0 && (
          <ReviewGroup title={`New ${feats}`}>
            {selectedFeatsData.map((feat, i) => (
              // A stackable feat can be picked at several levels.
              <ReviewItem key={`${feat.id}-${i}`} name={feat.name} />
            ))}
          </ReviewGroup>
        )}
        {autoGrantedFeats.length > 0 && (
          <ReviewGroup title={`Auto-Granted ${feats}`}>
            {autoGrantedFeats.map((feat, i) => (
              <ReviewItem key={`${feat.id}-${i}`} name={feat.name} />
            ))}
          </ReviewGroup>
        )}
        {selectedPowersData.length > 0 && (
          <ReviewGroup title={`New ${powers}`}>
            {selectedPowersData.map((power, i) => (
              // A stackable power can be picked at several levels.
              <ReviewItem key={`${power.id}-${i}`} name={power.name} />
            ))}
          </ReviewGroup>
        )}
        {autoGrantedPowers.length > 0 && (
          <ReviewGroup title={`Auto-Granted ${powers}`}>
            {autoGrantedPowers.map((power, i) => (
              <ReviewItem
                key={`${power.id}-${i}`}
                name={power.name}
                note={power.free ? freeGrantNote(rules?.levelUp.freeGrantNote) : undefined}
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
