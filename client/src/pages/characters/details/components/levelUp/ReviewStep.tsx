import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

import { SubsectionTitle } from "@/client/src/components/common/index.ts";
import { entityTypeLabel, formatWordCount } from "@/client/src/lib/rulesetLabels.ts";
import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";

import { freeGrantNote } from "./freeGrantNote.ts";
import { answerOf, type LevelStep, type LevelSteps, type PlanAnswer, type StepOf } from "./levelPlanQueries.ts";
import type { LevelPlanForm, PlannedSlot } from "./planRequest.ts";
import { valueAt } from "./spentValues.ts";
import { useCharacterRules } from "./useCharacterRules.ts";

interface ChooseReviewProps extends StepReviewProps {
  step: StepOf<"choose">;
}

interface PickReviewProps extends StepReviewProps {
  step: StepOf<"pick">;
}

interface ReviewGroupProps {
  children: ReactNode;
  title: string;
}

interface ReviewItemProps {
  name: string;
  note?: string;
}

/** What a level wizard hands its review: its steps, the plan's answer, and the form as it fits it. */
interface ReviewState {
  advancementWords: LevelSteps["advancements"] | undefined;
  answer: PlanAnswer | undefined;
  /** The form as the answer fits it: what the save sends */
  fitted: LevelPlanForm;
  levelSteps: readonly LevelStep[];
  slots: PlannedSlot[];
}

interface ReviewStepProps {
  characterId: string;
  wizard: ReviewState;
}

interface SpendReviewProps extends StepReviewProps {
  step: StepOf<"spend">;
}

interface StepReviewProps {
  answer: PlanAnswer;
  fitted: LevelPlanForm;
  slots: PlannedSlot[];
  /** Its rules' words for the kinds its steps pick ("Feats") */
  what: (kind: string | undefined) => string;
}

/** A `choose` step's choices, at the advancements that take one: each option and what it gains. */
function ChooseReview({ answer, fitted, slots, step }: ChooseReviewProps) {
  const choose = answerOf(answer, step);
  if (!choose) return null;
  const chosen = choose.advancements.flatMap((index) => {
    const optionId = fitted.choices[step.name]?.[slots[index]?.key];
    const option = choose.options.find((listed) => listed.id === optionId);
    return option ? [{ index, option }] : [];
  });
  if (chosen.length === 0) return null;
  return (
    <ReviewGroup title={chosen.length === 1 ? step.words.word.one : step.words.word.many}>
      {chosen.map(({ index, option }) => (
        <Typography key={index} variant="body1">
          <strong>{option.name}</strong> +{choose.amount}
        </Typography>
      ))}
    </ReviewGroup>
  );
}

/** A `pick` step's picks, then what the plan grants on its own. */
function PickReview({ answer, fitted, step, what }: PickReviewProps) {
  const pick = answerOf(answer, step);
  const picked = Object.values(fitted.picks[step.name] ?? {}).flat();
  const granted = pick?.granted ?? [];
  const word = what(step.kind);
  return (
    <>
      {picked.length > 0 && (
        <ReviewGroup title={`New ${word}`}>
          {picked.map((planned, i) => (
            // A stackable pick can be picked at several advancements
            <ReviewItem key={`${planned.id}-${i}`} name={planned.name} />
          ))}
        </ReviewGroup>
      )}
      {granted.length > 0 && (
        <ReviewGroup title={`Auto-Granted ${word}`}>
          {granted.map((entity, i) => (
            <ReviewItem
              key={`${entity.id}-${i}`}
              name={entity.name}
              note={entity.free ? freeGrantNote(step.words.grantNote) : undefined}
            />
          ))}
        </ReviewGroup>
      )}
    </>
  );
}

/** A titled group of a level review ("Class Advancement", "New Feats"). */
function ReviewGroup({ title, children }: ReviewGroupProps) {
  return (
    <Stack spacing={1}>
      <SubsectionTitle component="h4">{title}</SubsectionTitle>
      {children}
    </Stack>
  );
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

/** A `spend` step's points: each row's value gained, and its points when they differ, then the points spent. */
function SpendReview({ answer, fitted, step }: SpendReviewProps) {
  const spend = answerOf(answer, step);
  const points = fitted.points[step.name] ?? {};
  const spentOn = Object.entries(points).filter(([, spent]) => spent > 0);
  if (!spend || spentOn.length === 0) return null;
  const { currency, unit } = step.words;
  return (
    <ReviewGroup title={step.words.review}>
      <Stack spacing={1}>
        <Box>
          {spentOn.map(([rowId, spent]) => {
            const row = spend.rows.find((listed) => listed.id === rowId);
            if (!row) return null;
            // As the step shows them: what the server spreads the points to
            const gained = valueAt(row, spent);
            return (
              <ReviewItem
                key={rowId}
                name={row.name}
                note={`: +${formatWordCount(gained, unit)}${gained === spent ? "" : ` (${formatWordCount(spent, currency)})`}`}
              />
            );
          })}
        </Box>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {formatPointsSpent(pointsSpent(points), spend.budget)}
        </Typography>
      </Stack>
    </ReviewGroup>
  );
}

/**
 * The last step of the level wizards, every ruleset's alike: the plan's advancements and their values, then each step's
 * answer, in the steps' order, by its mechanic.
 */
export function ReviewStep({ characterId, wizard }: ReviewStepProps) {
  const { rules } = useCharacterRules(characterId);
  const { advancementWords, answer, fitted, levelSteps, slots } = wizard;
  if (!answer || !advancementWords) return null;
  const what = (kind: string | undefined) => entityTypeLabel(kind ?? "", rules?.words, true);
  const valueSteps = levelSteps.filter((step): step is StepOf<"value"> => step.mechanic === "value");
  const props = { answer, fitted, slots, what };

  return (
    // The review's own space under its last group, at the end of the wizard's scroll
    <Stack spacing={1} sx={{ pb: 3 }}>
      <SubsectionTitle>Review Changes</SubsectionTitle>
      <Stack spacing={3}>
        <ReviewGroup title={advancementWords.review}>
          {answer.advancements.map((advancement, index) => (
            <Typography key={index} variant="body1">
              <strong>{advancement.track.name}</strong> {advancementWords.position.one} {advancement.position}
              {valueSteps.map((step) => {
                const value = fitted.values[step.name]?.[slots[index]?.key];
                return (
                  value != null && (
                    <Box component="span" key={step.name}>
                      {" "}
                      — {step.words.unit}: +{value}
                    </Box>
                  )
                );
              })}
            </Typography>
          ))}
        </ReviewGroup>
        {levelSteps.map((step) => {
          switch (step.mechanic) {
            case "choose":
              return <ChooseReview key={step.name} step={step} {...props} />;
            case "pick":
              return <PickReview key={step.name} step={step} {...props} />;
            case "spend":
              return <SpendReview key={step.name} step={step} {...props} />;
            case "plan":
            case "value":
              // The advancements' own, above
              return null;
          }
        })}
      </Stack>
    </Stack>
  );
}
