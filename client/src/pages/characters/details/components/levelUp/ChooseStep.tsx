import { Box, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack } from "@mui/material";
import { useId } from "react";
import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { formatSigned } from "@/shared/text.ts";

import { type AnswerOf, answerOf, type PlanAnswer, type StepOf } from "./levelPlanQueries.ts";
import type { LevelPlanForm, PlannedSlot } from "./planRequest.ts";

interface ChoiceFieldProps {
  /** Its radios' group, one per field (an advancement's). */
  name: string;
  onChange: (optionId: string) => void;
  /** The options it chooses among, in the order the step gives them. */
  options: AnswerOf<"choose">["options"];
  /** What it asks, its step's ("Select an ability to increase") */
  prompt: string;
  value: string | null;
}

/** What a level wizard hands its `choose` step: the plan's answer, its advancements, and the form that holds the choices. */
interface ChooseState {
  /** The words its advancements take: a position's ("Level"). */
  advancementWords: { position: { many: string; one: string } } | undefined;
  answer: PlanAnswer | undefined;
  answerError: Error | null;
  control: Control<LevelPlanForm>;
  isAnswering: boolean;
  slots: PlannedSlot[];
}

interface ChooseStepProps {
  step: StepOf<"choose">;
  wizard: ChooseState;
}

/** The option an advancement's choice raises, each with its score and modifier. */
function ChoiceField({ name, onChange, options, prompt, value }: ChoiceFieldProps) {
  // The radios are named by the field's label
  const labelId = useId();
  return (
    <FormControl component="fieldset" sx={{ "& .MuiFormLabel-root": { mb: 0.25 } }}>
      <FormLabel component="legend" id={labelId}>
        {prompt}
      </FormLabel>
      <RadioGroup aria-labelledby={labelId} name={name} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <FormControlLabel
            key={option.id}
            value={option.id}
            control={<Radio />}
            label={`${option.name}: ${option.score} (${formatSigned(option.modifier)})`}
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}

/**
 * A `choose` step: an option chosen at each advancement that takes a choice (3.5's ability increase), Add Level's
 * planned ones each under its title, an edit's one alone, or a note that none does.
 */
export function ChooseStep({ step, wizard }: ChooseStepProps) {
  const { advancementWords, answer, answerError, control, isAnswering, slots } = wizard;
  // The form's choices, every step's: a step replaces them whole, so the wizard sees a new plan
  const { field } = useController({ control, name: "choices" });
  const choose = answerOf(answer, step);
  if (isAnswering) return <DiceSpinner />;
  if (answerError && !answer) return <LoadError what={step.label} error={answerError} />;
  if (!answer || !choose) return null;
  // Its rules' words: what it chooses ("ability increase"), at what ("these levels")
  const word = step.words.word.one.toLowerCase();
  const position = advancementWords?.position ?? { many: "", one: "" };
  if (choose.advancements.length === 0) {
    const at = slots.length > 1 ? `these ${position.many}` : `this ${position.one}`;
    return (
      <BlankNote>
        No {word} at {at.toLowerCase()}
      </BlankNote>
    );
  }

  const chosen = field.value[step.name] ?? {};
  // Each advancement that takes a choice, by its slot: the answer is for the planned ones (`isAnswering` waits for it)
  const choosing = choose.advancements.flatMap((index) => (slots[index] ? [{ index, key: slots[index].key }] : []));
  const choiceAt = (index: number, key: number) => (
    <ChoiceField
      prompt={step.words.prompt}
      options={choose.options}
      name={`${step.name}-${index}`}
      value={chosen[key] ?? null}
      onChange={(optionId) => field.onChange({ ...field.value, [step.name]: { ...chosen, [key]: optionId } })}
    />
  );
  // An edit's one advancement, its level's (its slot names no track): its field alone
  if (choosing.length === 1 && slots[0]?.track === undefined) return choiceAt(choosing[0].index, choosing[0].key);

  return (
    <Stack spacing={1.5}>
      {choosing.map(({ index, key }) => {
        const advancement = answer.advancements[index];
        return (
          <Stack key={index} spacing={1}>
            <SubsectionTitle>
              {advancement
                ? `${advancement.track.name} ${position.one} ${advancement.position}`
                : `${position.one} ${index + 1}`}
            </SubsectionTitle>
            {/* The field on a line of its own, under the advancement's title */}
            <Box>{choiceAt(index, key)}</Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
