import { keepPreviousData, useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo, useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { formatWordCount } from "@/client/src/lib/rulesetLabels.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { type StepOf, type StepOption, stepOptionsQuery } from "./levelPlanQueries.ts";
import type { PlannedSlot } from "./planRequest.ts";
import { canPlan, plannedPosition, plannedSlotKeys } from "./planSlots.ts";
import { useLevelWizard } from "./useLevelWizard.ts";
import { navigationOf } from "./wizardNavigation.ts";

interface UseAddLevelWizardParams {
  characterId: string;
  onClose: () => void;
  open: boolean;
  /** The track it plans for the next advancement as it opens, once the plan's options list it (`planOpenedTrack`) */
  trackId?: string;
}

/** The Add Level wizard's state: what its dialog and its steps read. */
export type AddLevelWizard = ReturnType<typeof useAddLevelWizard>;

/** The plan's options, a page at a time: its picker opens over the plan, at the character's next advancement. */
const PLAN_OPTIONS_PAGE = 10;

/**
 * Add Level, every ruleset's alike, on `useLevelWizard`: its `plan` step's slots (the tracks it adds advancements on,
 * `planSlots.ts`), the track it opened with first, the plan's options (its quick-add buttons', and an empty slot's
 * picker's), and the save of its plan. The plan is answered once it plans an advancement and moves past its plan step.
 */
export function useAddLevelWizard({ open, onClose, characterId, trackId }: UseAddLevelWizardParams) {
  const snackbar = useSnackbar();
  // The next slot's key: never one a removed slot had, whose values the form still holds by it
  const [nextKey, setNextKey] = useState(0);
  const [slotKeys, setSlotKeys] = useState<number[]>([]);
  const [plan, setPlan] = useState<(StepOption | null)[]>([]);
  // It has moved past its plan step: the plan is answered from then on, Back to it included
  const [planned, setPlanned] = useState(false);
  // The track it opened for, until the plan's options list it, then the slot it was planned in: the user's progress is
  // what they plan besides, until they move on from the plan, which makes the track theirs (Back keeps what they set
  // on the later steps)
  const [openedFor, setOpenedFor] = useState(trackId);
  const [openedSlot, setOpenedSlot] = useState<number>();

  // The planned advancements, in plan order: each its slot's key, its track and its position on it, a track planned
  // again taking the position after
  const slots = useMemo(() => {
    const keys = plannedSlotKeys(plan, slotKeys);
    const filled = plan.flatMap((option, index) => (option ? [{ index, option }] : []));
    return filled.map(({ index, option }, i): PlannedSlot => ({
      key: keys[i],
      position: plannedPosition(option, plan, index),
      track: option.id,
    }));
  }, [plan, slotKeys]);

  const wizard = useLevelWizard({
    answerable: planned && slots.length > 0,
    characterId,
    editedLevelId: undefined,
    open,
    slots,
  });
  const { activeStep, levelSteps, pickerRequest, refreshAfterSave, handleSaveError, step, stepsError } = wizard;
  if (activeStep > 0 && !planned) setPlanned(true);
  if (activeStep > 0 && openedSlot !== undefined) setOpenedSlot(undefined);

  // The plan's options: over the plan so far once it's answered, the character as it stands before
  const planStep = levelSteps.find((listed): listed is StepOf<"plan"> => listed.mechanic === "plan");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const options = useListboxQuery({
    ...stepOptionsQuery(
      characterId,
      planStep?.name ?? "",
      // Its plan so far once answered, none before: the character as it stands
      planStep && (pickerRequest ?? { steps: {} }),
      {},
      debouncedSearch,
      PLAN_OPTIONS_PAGE,
    ),
    enabled: open && step.mechanic === "plan",
    // Planning a track re-keys the query, which would drop the options while it refetches: the previous ones stay
    // shown, so the quick-add buttons don't flash
    placeholderData: keepPreviousData,
  });
  const optionItems = options.items as StepOption[];

  // The quick-add buttons show the character's tracks whatever the search: the unsearched options, kept while a search
  // shows another, or a refetch none
  const [quickAddSnapshot, setQuickAddSnapshot] = useState<StepOption[]>([]);
  const hasUnfilteredOptions = !debouncedSearch && optionItems.length > 0;
  if (hasUnfilteredOptions && optionItems !== quickAddSnapshot) setQuickAddSnapshot(optionItems);
  const quickAddOptions = hasUnfilteredOptions ? optionItems : quickAddSnapshot;

  /** Adds a slot at the end of the plan, empty or filled (`option`): its key, which a track it opened for keeps. */
  const addSlot = (option: StepOption | null) => {
    const key = nextKey;
    setNextKey(key + 1);
    setSlotKeys((prev) => [...prev, key]);
    setPlan((prev) => [...prev, option]);
    return key;
  };

  // The track it opened for joins the plan once the unsearched options are in, fetched as the sheet stands now: if it
  // can take the plan's next advancement. The wizard plans it as it renders, changing its own state, as React allows
  if (openedFor && hasUnfilteredOptions && !options.isFetching) {
    setOpenedFor(undefined);
    const option = optionItems.find((item) => item.id === openedFor);
    if (option && canPlan(option, plan, option.track?.left)) setOpenedSlot(addSlot(option));
  }

  const saveMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) =>
      parseResponse(
        rpc.api.characters.levels[":characterId"].$post({
          param: { characterId },
          json: { steps: wizard.saveRequest().steps, force },
        }),
      ),
    onSuccess: async (created) => {
      await refreshAfterSave();
      const word = wizard.advancementWords?.position;
      snackbar.success(word ? `Added ${formatWordCount(created.length, word)}` : "Saved");
      onClose();
    },
    onError: handleSaveError,
  });

  // Next waits for the steps the level lists, and on the step shown for its answer (`isAnswered`). The dialog also
  // disables it while the save runs.
  const isNextDisabled = !wizard.stepsLoaded || !wizard.isAnswered(step);

  return {
    ...wizard,
    ...navigationOf({
      // Cancel asks before it discards a plan: the user's, which the track it opened with alone, untouched on the plan,
      // isn't
      hasProgress: activeStep > 0 || plan.some((option, index) => option !== null && slotKeys[index] !== openedSlot),
      onClose,
      save: (force) => saveMutation.mutate({ force }),
      wizard,
    }),
    handleAddSlot: () => addSlot(null),
    handleQuickAdd: (option: StepOption) => addSlot(option),
    handleRemoveSlot: (index: number) => {
      setPlan((prev) => prev.filter((_, i) => i !== index));
      setSlotKeys((prev) => prev.filter((_, i) => i !== index));
    },
    handleSlotChange: (index: number, option: StepOption | null) =>
      setPlan((prev) => prev.map((planned, i) => (i === index ? option : planned))),
    isNextDisabled,
    isSaving: saveMutation.isPending,
    // The steps' list failed to load: the wizard can't go on
    loadError: stepsError,
    plan,
    planOptions: {
      error: options.error,
      items: optionItems,
      loading: options.isLoading,
      onScroll: options.onScroll,
      quickAdd: quickAddOptions,
      search,
      setSearch,
    },
    slotKeys,
  };
}
