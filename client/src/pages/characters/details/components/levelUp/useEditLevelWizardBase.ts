import { useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { EditAnswers } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { hpSet } from "./hitPoints.ts";
import type { PickerLevel, PowerPickerLevel } from "./levelUpQueries.ts";
import { abilityIncreasesOf, powerPickString } from "./pendingPicks.ts";
import type { EditedLevel } from "./useEditedLevel.ts";
import { useFittedPicks } from "./useFittedPicks.ts";
import { type LevelUpFormData, pickIds } from "./useLevelWizardBase.ts";
import { navigationOf } from "./wizardNavigation.ts";
import { HP_STEP } from "./wizardSteps.ts";

interface EditLevelWizardBaseParams {
  /** What the ruleset's steps answer of the level, which its hook reads */
  answers: EditAnswers;
  characterId: string;
  /** The level it edits (`useEditedLevel`'s), which the ruleset answered */
  level: EditedLevel;
  onClose: () => void;
}

/**
 * Edit Level on its level and the ruleset's answers to its steps, every ruleset's alike: the picks as they fit, the
 * level its pickers' options are checked at, the save, and the way through its steps. Its ruleset's hook adds what its
 * steps read of the answers.
 */
export function useEditLevelWizardBase({ level, answers, characterId, onClose }: EditLevelWizardBaseParams) {
  const snackbar = useSnackbar();
  const {
    editingLevelId,
    handleSaveError,
    handleSubmit,
    hpLevels,
    increasedStep,
    isLoadingLevel,
    levelData,
    levelError,
    refreshAfterSave,
    resetPicks,
    selectedClass,
    selectedHP,
    stepName,
    stepsError,
    stepsLoaded,
    sync,
  } = level;

  // The feats and spells that fit the level's pools, and the skill points its own: its ability increase changes how
  // many it has
  const fitted = useFittedPicks(level, answers);
  const { featPicks, selectedFeats, selectedPowers, skillPointAllocations } = fitted;
  const featPicker: PickerLevel = { ...increasedStep, featPicks };
  const powerPicker: PowerPickerLevel = { ...featPicker, selectedPowerIds: powerPickString(selectedPowers) };

  const finalizeMutation = useMutation({
    mutationFn: async ({ data, force }: { data: LevelUpFormData; force: boolean }) => {
      // Next waits for the level's HP and its slots, which the picks are saved as they fit
      if (data.selectedHP === null || !answers.complete) throw new Error("The level isn't ready to save");
      return parseResponse(
        rpc.api.characters.levels[":characterId"][":characterLevelId"].$put({
          param: { characterId, characterLevelId: editingLevelId },
          json: {
            hp: data.selectedHP,
            abilityIncreases: abilityIncreasesOf(data.selectedAttribute),
            skills: skillPointAllocations,
            feats: pickIds(selectedFeats),
            powers: pickIds(selectedPowers),
            force,
          },
        }),
      );
    },
    onSuccess: async () => {
      await refreshAfterSave();
      snackbar.success("Level updated");
      resetPicks();
      onClose();
    },
    onError: handleSaveError,
  });

  // The saved level fills the picks in as it loads, and its class's slots, which load after it, fit its picks: Next
  // waits for the steps the ruleset lists and its answers (`waiting`), and a load that failed stops the wizard at the
  // step that shows its error. The dialog also disables it while the save runs.
  const loading = isLoadingLevel || (!!levelData && !selectedClass) || answers.waiting;
  const failed = !levelData || !stepsLoaded;
  const isNextDisabled = loading || failed || (stepName === HP_STEP.name && !hpSet(hpLevels, [selectedHP]));

  return {
    ...level,
    ...fitted,
    ...navigationOf({
      // Changed picks ask before they're discarded, as Add Level's plan does
      hasProgress: sync.isDirty,
      onClose,
      reset: resetPicks,
      // Through the form, so its own rules still hold on a forced save, as on any other
      save: (force) => handleSubmit((data) => finalizeMutation.mutate({ data, force }))(),
      wizard: level,
    }),
    featPicker,
    isNextDisabled,
    isSaving: finalizeMutation.isPending,
    // The saved level, or the steps' list, failed to load: the wizard can't go on
    loadError: (!levelData && levelError && { what: "Level", error: levelError }) || stepsError,
    powerPicker,
  };
}
