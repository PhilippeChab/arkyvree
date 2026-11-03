import { useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo } from "react";

import type { EditingAdvancement } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync } from "@/client/src/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import {
  advancementPlanQuery,
  type AdvancementStep,
  answerOf,
  type PlanAnswer,
  type PlanRequest,
  savedPlanQuery,
} from "./advancementPlanQueries.ts";
import type { SheetSummaryWords } from "./AdvancementWizardDialog.tsx";
import type { AdvancementPlanForm, PlannedPick } from "./planRequest.ts";
import { useAdvancementWizard } from "./useAdvancementWizard.ts";
import { navigationOf } from "./wizardNavigation.ts";

interface UseEditAdvancementWizardParams {
  characterId: string;
  /** The advancement it edits, as the sheet lists it. */
  editingAdvancement: EditingAdvancement;
  onClose: () => void;
  open: boolean;
  words: SheetSummaryWords;
}

/** The edited advancement: its values and choices are kept by its key. */
const EDITED_SLOTS = [{ key: 0 }];

/**
 * A saved advancement's plan (`saved`, each step's payload as it saved it) as the wizard's form holds it, read by its
 * steps' mechanics (`steps`), its picks named as its answer names them (`answer`).
 */
function formOfSaved(steps: readonly AdvancementStep[], saved: PlanRequest, answer: PlanAnswer): AdvancementPlanForm {
  const form: AdvancementPlanForm = { choices: {}, picks: {}, points: {}, values: {} };
  for (const step of steps) {
    const payload = saved.steps[step.name] ?? [];
    switch (step.mechanic) {
      case "choose": {
        const [chosen] = payload as { id: string }[][];
        form.choices[step.name] = { 0: chosen?.[0]?.id ?? null };
        break;
      }
      case "pick": {
        const named = new Map(
          Object.values(answerOf(answer, step)?.picked ?? {}).flatMap((picks) => picks.map((pick) => [pick.id, pick])),
        );
        const pools: Record<string, PlannedPick[]> = {};
        for (const { id, pool, tier } of payload as { id: string; pool: string; tier?: string }[]) {
          const pick = named.get(id);
          (pools[pool] ??= []).push({
            description: pick?.description ?? null,
            id,
            name: pick?.name ?? id,
            ...(tier !== undefined && { tier }),
          });
        }
        form.picks[step.name] = pools;
        break;
      }
      case "plan":
        break;
      case "spend":
        form.points[step.name] = Object.fromEntries(
          (payload as { id: string; points: number }[]).map(({ id, points }) => [id, points]),
        );
        break;
      case "value": {
        const [value] = payload as number[];
        form.values[step.name] = { 0: value ?? null };
        break;
      }
    }
  }
  return form;
}

/**
 * Edit Level, every ruleset's alike, on `useAdvancementWizard`: the saved advancement as its plan, which fills its form
 * once it and its answer (which names its picks) load, its one advancement in the saved advancement's place, and its
 * save.
 */
export function useEditAdvancementWizard({
  open,
  onClose,
  characterId,
  editingAdvancement,
  words,
}: UseEditAdvancementWizardParams) {
  const snackbar = useSnackbar();
  const editedAdvancementId = editingAdvancement.advancementId;
  const wizard = useAdvancementWizard({
    answerable: true,
    characterId,
    editedAdvancementId,
    open,
    saveFailed: words.saveFailed,
    slots: EDITED_SLOTS,
  });
  const { form, handleSaveError, refreshAfterSave, step, stepsError } = wizard;

  const savedQuery = useQuery({ ...savedPlanQuery(characterId, editedAdvancementId), enabled: open });
  // The saved plan's answer, which names its picks
  const savedAnswerQuery = useQuery({ ...advancementPlanQuery(characterId, savedQuery.data), enabled: open });
  // The saved advancement, as the wizard's form: it takes it once the advancement, its steps and its answer load
  const savedForm = useMemo(
    () =>
      savedQuery.data && savedAnswerQuery.data && wizard.stepsLoaded
        ? formOfSaved(wizard.advancementSteps, savedQuery.data, savedAnswerQuery.data)
        : undefined,
    [savedQuery.data, savedAnswerQuery.data, wizard.stepsLoaded, wizard.advancementSteps],
  );
  const sync = useFormSync(form, savedForm, { key: editedAdvancementId });

  const saveMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) =>
      parseResponse(
        rpc.api.characters.advancements[":characterId"][":advancementId"].$put({
          param: { characterId, advancementId: editedAdvancementId },
          json: { steps: wizard.saveRequest().steps, force },
        }),
      ),
    onSuccess: async () => {
      await refreshAfterSave();
      snackbar.success(words.updated);
      onClose();
    },
    onError: handleSaveError,
  });

  // The saved advancement fills the form in as it loads, which its answer fits: Next waits for the steps the
  // advancement lists and the step's answer (`isAnswered`), and a load that failed stops the wizard at the step that
  // shows its error. The dialog also disables it while the save runs.
  const loading = savedQuery.isLoading || (!!savedQuery.data && !savedForm && !savedAnswerQuery.error);
  const isNextDisabled = loading || !savedQuery.data || !wizard.stepsLoaded || !wizard.isAnswered(step);

  return {
    ...wizard,
    ...navigationOf({
      // Changed picks ask before they're discarded, as Add Level's plan does
      hasProgress: sync.isDirty,
      onClose,
      save: (force) => saveMutation.mutate({ force }),
      wizard,
    }),
    isNextDisabled,
    isSaving: saveMutation.isPending,
    // The saved advancement, or the steps' list, failed to load: the wizard can't go on
    loadError:
      (!savedQuery.data && savedQuery.error && { what: words.advancement, error: savedQuery.error }) ||
      (!savedAnswerQuery.data &&
        savedAnswerQuery.error && { what: words.advancement, error: savedAnswerQuery.error }) ||
      stepsError,
  };
}
