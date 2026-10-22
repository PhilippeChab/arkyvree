import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useValidationIssues } from "@/client/src/components/characters/index.ts";
import { useDebouncedValue, useFormWith, useToggleSet } from "@/client/src/hooks/index.ts";
import { invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

import { fitPlan } from "./fitPicks.ts";
import {
  answerOf,
  levelPlanQuery,
  type LevelStep,
  levelStepsQuery,
  type PlanAnswer,
  type StepOf,
} from "./levelPlanQueries.ts";
import { EMPTY_PLAN, type LevelPlanForm, type PlannedSlot, planRequestOf } from "./planRequest.ts";
import { answersSlots } from "./planSlots.ts";
import { valuesSet } from "./planValues.ts";
import { shownStep } from "./wizardNavigation.ts";
import { REVIEW_STEP } from "./wizardSteps.ts";

interface LevelWizardParams {
  /** The plan can be answered: Add Level's once it plans an advancement and moves past its plan, an edit's at once */
  answerable: boolean;
  characterId: string;
  /** The saved level an edit edits: its steps and its plan are its */
  editedLevelId?: string;
  open: boolean;
  /** The plan's advancements, in order: Add Level's planned ones, an edit's one */
  slots: PlannedSlot[];
}

/** Where a `pick` step's picker is open: its pool, and its tier when the pool picks by tier. */
export interface OpenPool {
  pool: string;
  tier?: string;
}

/** A level wizard's shared state (`useLevelWizard`'s), which its steps read. */
export type LevelWizard = ReturnType<typeof useLevelWizard>;

/** A step a wizard shows: one its level lists, or its own review. */
export type WizardStep = LevelStep | typeof REVIEW_STEP;

/** A form's choices at advancements that no longer take one dropped: what a plan request and a save read. */
function choosingOf(steps: readonly LevelStep[], answer: PlanAnswer | undefined) {
  if (!answer) return undefined;
  const choose = steps.filter((step): step is StepOf<"choose"> => step.mechanic === "choose");
  return {
    amounts: Object.fromEntries(choose.map((step) => [step.name, answerOf(answer, step)?.amount ?? 1])),
    choosing: Object.fromEntries(choose.map((step) => [step.name, answerOf(answer, step)?.advancements ?? []])),
  };
}

/**
 * What Add Level and Edit Level share, every ruleset's alike, by their steps' mechanics: the plan's form (each step's
 * answer by its name, `LevelPlanForm`), the steps the level lists then its review, the step it's at, the plan's answer
 * and the form as it fits it (`fitted`), the plan request its pickers and its save send, each `pick` step's open pool,
 * search and expanded groups, whether Next waits on the step shown, and the save's cache refresh and errors. Its way
 * through the steps is `navigationOf`'s, once its save is known.
 */
export function useLevelWizard({ answerable, characterId, editedLevelId, open, slots }: LevelWizardParams) {
  const queryClient = useQueryClient();
  const form = useFormWith<LevelPlanForm>(EMPTY_PLAN, { mode: "onChange" });
  const { control, watch } = form;
  // What was given: each wizard reads it fitted to the plan's answer
  const choices = watch("choices");
  const picks = watch("picks");
  const points = watch("points");
  const values = watch("values");
  // The points spent so far, which the plan says what they come to: sent once the typing settles
  const debouncedPoints = useDebouncedValue(points);

  // The step Back and Next moved it to, which it shows while its steps list it (`activeStep`)
  const [movedTo, setActiveStep] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [openPools, setOpenPools] = useState<Record<string, OpenPool | null>>({});
  const [searches, setSearches] = useState<Record<string, string>>({});
  const { keys: expandedGroups, toggle: toggleGroup } = useToggleSet();
  const { issues, setIssues, handleSaveError } = useValidationIssues("Failed to finalize level up");

  // Its steps: those the level lists, then its review
  const stepsQuery = useQuery({ ...levelStepsQuery(characterId, editedLevelId), enabled: open });
  const levelSteps = useMemo(() => stepsQuery.data?.steps ?? [], [stepsQuery.data]);
  const steps: readonly WizardStep[] = [...levelSteps, REVIEW_STEP];
  const activeStep = shownStep(steps, movedTo);
  const step = steps[activeStep];
  const isLastStep = activeStep === steps.length - 1;
  // The steps' list failed to load: the wizard can't go on
  const stepsError = !stepsQuery.data && stepsQuery.error ? { what: "Steps", error: stepsQuery.error } : undefined;

  // The plan's last answer, whose advancements that take a choice its next request sends choices at
  const [answered, setAnswered] = useState<PlanAnswer>();
  const context = useMemo(
    () => ({ ...choosingOf(levelSteps, answered), editedLevelId }),
    [levelSteps, answered, editedLevelId],
  );
  const request = useMemo(
    () =>
      answerable && levelSteps.length > 0
        ? planRequestOf(levelSteps, slots, { choices, picks, points: debouncedPoints, values }, context)
        : undefined,
    [answerable, levelSteps, slots, choices, picks, debouncedPoints, values, context],
  );
  // Its last answer kept while it answers for the new picks, which stand meanwhile
  const answerQuery = useQuery({
    ...levelPlanQuery(characterId, request),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const answer = answerQuery.data;
  if (answer && answer !== answered) setAnswered(answer);
  // The answer is for the advancements planned: one kept from another plan (a slot removed since) isn't read by them
  const answerFits = !!answer && answersSlots(answer.advancements, slots);
  // What fits of the picks and the points, as the answer for them says: while it answers for earlier ones, they stand
  const fittedFor = answerQuery.isPlaceholderData ? undefined : answer;
  const fitted = useMemo(
    () => fitPlan(levelSteps, { choices, picks, points, values }, fittedFor),
    [levelSteps, choices, picks, points, values, fittedFor],
  );
  // What its pickers check their options against: the plan, its picks as they fit
  const pickerRequest = useMemo(
    () => (request ? planRequestOf(levelSteps, slots, fitted, context) : undefined),
    [request, levelSteps, slots, fitted, context],
  );

  /** The plan its save sends: every step's payload, every advancement's value. */
  const saveRequest = () => planRequestOf(levelSteps, slots, fitted, { ...context, saving: true });

  /** Whether a step's answer is in for what was given, and done, which Next waits for. */
  const isAnswered = (shown: WizardStep) => {
    switch (shown.mechanic) {
      case "choose":
        return answerFits && !answerQuery.isPlaceholderData && (answerOf(answer, shown)?.chosen ?? false);
      case "pick":
      case "spend":
        return !!answer;
      case "plan":
        return slots.length > 0;
      case "review":
        return answerFits;
      case "value":
        return answerFits && valuesSet(answerOf(answer, shown)?.advancements, slots, fitted.values[shown.name]);
    }
  };

  /** Drops the wizard's cached answers and refetches the sheet once the save lands. */
  const refreshAfterSave = async () => {
    queryClient.removeQueries({ queryKey: QUERY_KEYS.characters.levelUp.all(characterId) });
    // Its cards show its levels
    void invalidateCharacterListings(queryClient);
    await invalidateCharacter(queryClient, characterId);
  };

  return {
    activeStep,
    advancementWords: stepsQuery.data?.advancements,
    answer,
    answerError: !answer && answerQuery.error ? answerQuery.error : null,
    control,
    expandedGroups,
    fitted,
    form,
    handleSaveError,
    isAnswered,
    // Its first answer, or one for the advancements planned, is on its way
    isAnswering: answerQuery.isLoading || (!!answer && !answerFits),
    isLastStep,
    issues,
    levelSteps,
    openPools,
    pickerRequest,
    refreshAfterSave,
    saveRequest,
    searches,
    setActiveStep,
    setIssues,
    setOpenPool: (stepName: string, at: OpenPool | null) => setOpenPools((prev) => ({ ...prev, [stepName]: at })),
    setSearch: (stepName: string, search: string) => setSearches((prev) => ({ ...prev, [stepName]: search })),
    setShowCancelConfirm,
    showCancelConfirm,
    slots,
    step,
    steps,
    stepsError,
    stepsLoaded: stepsQuery.data !== undefined,
    toggleGroup,
  };
}
