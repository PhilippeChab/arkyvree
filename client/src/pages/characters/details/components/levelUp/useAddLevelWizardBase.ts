import { keepPreviousData, useMutation } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useMemo, useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { PreviewAnswers } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { type HpLevel, hpSet } from "./hitPoints.ts";
import { availableClassesQuery, type ClassPicker, type PowerPickerLevel } from "./levelUpQueries.ts";
import {
  abilityIncreasesOf,
  plannedLevelsOf,
  plannedPicker,
  powerPickString,
  skillPointString,
} from "./pendingPicks.ts";
import type { AddLevelPlan } from "./useAddLevelPlan.ts";
import { useFittedPicks } from "./useFittedPicks.ts";
import { type AvailableKlass, pickIds } from "./useLevelWizardBase.ts";
import { navigationOf } from "./wizardNavigation.ts";
import { CLASS_PLAN_STEP, HP_STEP } from "./wizardSteps.ts";

interface AddLevelWizardBaseParams {
  /** What the ruleset's preview of the plan answers, which its hook reads */
  answers: PreviewAnswers;
  characterId: string;
  onClose: () => void;
  open: boolean;
  /** Its plan (`useAddLevelPlan`'s), which the ruleset answered */
  plan: AddLevelPlan;
}

/**
 * Add Level on its plan and the ruleset's answers to it, every ruleset's alike: the picks as they fit, each planned
 * level's hit points and ability increase as the preview lists the levels, the class picker's list, the level each
 * picker's next pick lands on, the save, and the way through its steps. Its ruleset's hook adds what its steps read
 * of the answers.
 */
export function useAddLevelWizardBase({ plan, answers, characterId, open, onClose }: AddLevelWizardBaseParams) {
  const snackbar = useSnackbar();
  const {
    abilityBySlot,
    debouncedKlassSearch,
    hpValues,
    levelKeys,
    refreshAfterSave,
    handleSaveError,
    resetPlan,
    selectedPowerAptitude,
    selectedPowerLevel,
    stepName,
    stepsError,
    stepsLoaded,
    validClassPlan,
  } = plan;
  const { abilityIncreaseLevels, levelDetails, nextPickLevels } = answers;

  // Each planned level's ability increase: its slot's, while the level is one that takes an increase
  const abilityIncreases = useMemo(
    () => levelKeys.map((key, index) => (abilityIncreaseLevels.includes(index) ? (abilityBySlot[key] ?? null) : null)),
    [levelKeys, abilityBySlot, abilityIncreaseLevels],
  );

  // The planned levels whose hit points the HP step sets, as the preview lists them, with the hit points each may gain
  const hpLevels = useMemo<HpLevel[]>(
    () =>
      (levelDetails ?? []).map((detail) => ({
        className: detail.klassName,
        hd: detail.hd,
        hitPoints: detail.hitPoints,
        nextLevel: detail.level,
      })),
    [levelDetails],
  );

  // The picks the preview fits to the plan's pools: while it answers for earlier picks, they stand
  const fitted = useFittedPicks(plan, answers);
  const { featPicks, selectedAptitude, selectedFeats, selectedPowers, skillPointAllocations } = fitted;

  // The class picker's: every planned level, and what's picked over them so far
  const classPicker: ClassPicker = {
    ...plannedLevelsOf(levelDetails, abilityIncreases),
    featPicks,
    skillPoints: skillPointString(skillPointAllocations),
  };

  const {
    items: availableKlasses,
    isLoading: isLoadingKlasses,
    error: klassesError,
    onScroll: handleKlassesScroll,
  } = useListboxQuery({
    ...availableClassesQuery(characterId, debouncedKlassSearch, classPicker),
    enabled: open && stepName === CLASS_PLAN_STEP.name,
    // Adding a class to the plan re-keys the query, which would drop the data while it refetches: the previous result
    // stays shown, so the quick-add buttons don't flash
    placeholderData: keepPreviousData,
  });

  // The quick-add buttons show the character's classes whatever the search: the unsearched list, kept while a search
  // shows another, or a refetch none
  const [quickAddSnapshot, setQuickAddSnapshot] = useState<AvailableKlass[]>([]);
  const hasUnfilteredKlasses = !debouncedKlassSearch && availableKlasses.length > 0;
  if (hasUnfilteredKlasses && availableKlasses !== quickAddSnapshot) setQuickAddSnapshot(availableKlasses);
  const quickAddKlasses = hasUnfilteredKlasses ? availableKlasses : quickAddSnapshot;

  // The level the next feat pick lands on, which its options are checked at: the feat list's, and a family's variants'
  const featPicker = plannedPicker(
    levelDetails,
    abilityIncreases,
    selectedAptitude ? (nextPickLevels?.feats[selectedAptitude] ?? 0) : 0,
    featPicks,
  );

  // The level the next spell pick lands on, in the open pool at its open spell level, but the spells picked already
  const powerPicker: PowerPickerLevel = {
    ...plannedPicker(
      levelDetails,
      abilityIncreases,
      selectedPowerAptitude ? (nextPickLevels?.powers[selectedPowerAptitude]?.[selectedPowerLevel ?? ""] ?? 0) : 0,
      featPicks,
    ),
    selectedPowerIds: powerPickString(selectedPowers),
  };

  // Pool-level picks; the backend distributes them to the levels.
  const finalizeMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      // The plan's levels as its preview lists them, each with its HP: Next waits for both
      if (!levelDetails || !hpSet(hpLevels, hpValues)) throw new Error("The plan isn't ready to save");
      const levels = levelDetails.map((detail, i) => ({
        klassId: detail.klassId,
        level: detail.level,
        hp: hpValues[i],
        abilityIncreases: abilityIncreasesOf(abilityIncreases[i]),
      }));
      return parseResponse(
        rpc.api.characters.levels[":characterId"].finalize.$post({
          param: { characterId },
          json: {
            levels,
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
      snackbar.success(`Added ${formatCount(validClassPlan.length, "level")}`);
      resetPlan();
      onClose();
    },
    onError: handleSaveError,
  });

  // Next waits for the steps the ruleset lists. The dialog also disables it while the save runs.
  const isNextDisabled = useMemo(() => {
    if (!stepsLoaded) return true;
    switch (stepName) {
      case CLASS_PLAN_STEP.name:
        return validClassPlan.length < 1;
      case HP_STEP.name:
        return !hpSet(hpLevels, hpValues);
      default:
        return false;
    }
  }, [stepsLoaded, stepName, validClassPlan, hpLevels, hpValues]);

  return {
    ...plan,
    ...fitted,
    ...navigationOf({
      hasProgress: plan.hasProgress,
      onClose,
      reset: resetPlan,
      save: (force) => finalizeMutation.mutate({ force }),
      wizard: plan,
    }),
    abilityIncreases,
    availableKlasses,
    featPicker,
    handleKlassesScroll,
    hpLevels,
    isLoadingKlasses,
    isNextDisabled,
    isSaving: finalizeMutation.isPending,
    klassesError,
    // The steps' list failed to load: the wizard can't go on
    loadError: stepsError,
    powerPicker,
    quickAddKlasses,
  };
}
