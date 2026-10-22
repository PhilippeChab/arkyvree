import { Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useController, type UseFormReturn } from "react-hook-form";

import { DiceSpinner, LoadError, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";
import { readNumberInput } from "@/client/src/lib/validation.ts";
import { rollDie } from "@/client/src/pages/characters/dice.ts";
import { RollAllButton } from "@/client/src/pages/characters/RollAllButton.tsx";
import { useDiceRoll } from "@/client/src/pages/characters/useDiceRoll.ts";
import { PREFERS_REDUCED_MOTION, settleOutlineAnimation } from "@/client/src/theme/animations.ts";

import { answerOf, type PlanAnswer, type StepOf } from "./levelPlanQueries.ts";
import type { LevelPlanForm, PlannedSlot } from "./planRequest.ts";
import { valueError } from "./planValues.ts";

/** What a level wizard hands its `value` step: the plan's answer, its advancements, and the form that holds the values. */
interface ValueState {
  /** The words its advancements take: a position's ("Level"). */
  advancementWords: { position: { one: string } } | undefined;
  answer: PlanAnswer | undefined;
  answerError: Error | null;
  /** The plan's form: its values, which each roll's landing reads as they stand then */
  form: UseFormReturn<LevelPlanForm>;
  isAnswering: boolean;
  slots: PlannedSlot[];
}

interface ValueStepProps {
  step: StepOf<"value">;
  wizard: ValueState;
}

/**
 * A `value` step: each advancement's value (3.5's hit points), Add Level's planned ones or Edit Level's one, typed,
 * rolled within its bounds or set to their most, in the step's words.
 */
export function ValueStep({ step, wizard }: ValueStepProps) {
  const { advancementWords, answer, answerError, form, isAnswering, slots } = wizard;
  // The form's values, every step's: a step replaces them whole, so the wizard sees a new plan
  const { field } = useController({ control: form.control, name: "values" });
  const diceRoll = useDiceRoll();
  const bounds = answerOf(answer, step)?.advancements;
  if (isAnswering) return <DiceSpinner />;
  if (answerError && !answer) return <LoadError what={step.label} error={answerError} />;
  // An edit's advancement loads with the level it edits
  if (!answer || !bounds || bounds.length === 0) return <DiceSpinner />;

  const values = field.value[step.name] ?? {};
  // Each lands on the values as they stand then, an earlier roll's landing included
  const setValue = (index: number, value: number | null) => {
    const { key } = slots[index];
    const all = form.getValues("values");
    field.onChange({ ...all, [step.name]: { ...all[step.name], [key]: value } });
  };
  const rollAt = (indexes: number[]) =>
    diceRoll.roll(
      indexes.map((index) => {
        const { max, min } = bounds[index];
        return { key: String(index), roll: () => min - 1 + rollDie(max - min + 1) };
      }),
      (key, value) => setValue(Number(key), value),
    );
  const position = advancementWords?.position.one ?? "";

  return (
    // The step's own space under its last field
    <Stack spacing={3} sx={{ pb: 1 }}>
      <Stack direction="row" spacing={1}>
        <RollAllButton onClick={() => rollAt(bounds.map((_, index) => index))} disabled={diceRoll.rolling} />
        <Button
          onClick={() =>
            field.onChange({
              ...field.value,
              [step.name]: {
                ...values,
                ...Object.fromEntries(slots.map(({ key }, index) => [key, bounds[index]?.max ?? null])),
              },
            })
          }
          size="small"
          disabled={diceRoll.rolling}
        >
          Max All
        </Button>
      </Stack>
      <Stack spacing={4}>
        {slots.map(({ key }, index) => {
          const bound = bounds[index];
          const advancement = answer.advancements[index];
          if (!bound || !advancement) return null;
          const value = values[key] ?? null;
          // An advancement rolling shows its die's faces until it lands
          const face = diceRoll.faceOf(String(index));
          const error = value === null ? undefined : valueError(value, bound);
          return (
            <Stack key={key} spacing={2}>
              <Box>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <SubsectionTitle>
                    {step.words.prompt} {advancement.track.name} {position} {advancement.position}
                  </SubsectionTitle>
                  <IconButton
                    onClick={() => rollAt([index])}
                    disabled={diceRoll.rolling}
                    color="primary"
                    size="small"
                    aria-label={`Roll ${bound.roll}`}
                  >
                    <CasinoIcon />
                  </IconButton>
                  <Button size="small" onClick={() => setValue(index, bound.max)} disabled={diceRoll.rolling}>
                    Max
                  </Button>
                </Stack>
                <Typography variant="body2" sx={{ color: "text.secondary" }} gutterBottom>
                  {step.words.entry} ({bound.min} to {bound.max}). Average: {bound.average}, Maximum: {bound.max}
                </Typography>
              </Box>
              <TextField
                label={step.words.unit}
                type="number"
                value={face ?? value ?? ""}
                onChange={(e) => setValue(index, readNumberInput(e.target.value) ?? null)}
                error={!!error}
                helperText={error}
                inputRef={index === 0 ? field.ref : undefined}
                fullWidth
                // As a rolled ability score's card: its value tumbles in its usual look, then its outline pulses
                sx={{
                  "& .MuiOutlinedInput-notchedOutline": {
                    animation: diceRoll.hasLanded(String(index)) ? settleOutlineAnimation : undefined,
                  },
                  [PREFERS_REDUCED_MOTION]: { "& .MuiOutlinedInput-notchedOutline": { animation: "none" } },
                }}
                slotProps={{
                  input: { readOnly: face !== undefined },
                  htmlInput: { min: bound.min, max: bound.max, step: 1 },
                }}
              />
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
