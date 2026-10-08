import { useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo } from "react";
import { useController } from "react-hook-form";

import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { fitFeats, openPoolOf } from "./fitPicks.ts";
import { type HpLevel, hpSet } from "./hitPoints.ts";
import {
  attributeSlotsQuery,
  availableFeatsGroupedQuery,
  availablePowersQuery,
  featSlotsQuery,
  type PickerLevel,
  powerSlotsQuery,
  skillSlotsQuery,
  type StepLevel,
} from "./levelUpQueries.ts";
import type { LevelUpFormData } from "./levelUpTypes.ts";
import { featPickString } from "./pendingPicks.ts";
import { editedLevelSkills } from "./skillLevels.ts";
import { pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";

interface UseEditLevelWizardParams {
  characterId: string;
  editingLevelId: string;
  onClose: () => void;
  open: boolean;
}

/** The Edit Level wizard's state: what its dialog and its steps read. */
export type EditLevelWizard = ReturnType<typeof useEditLevelWizard>;

export const EDIT_STEP_CONTENT = ["hp", "attributes", "skills", "feats", "powers", "review"] as const;

export const EDIT_STEP_LABELS = [
  "Select HP",
  "Attribute Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

export function useEditLevelWizard({ open, onClose, characterId, editingLevelId }: UseEditLevelWizardParams) {
  const base = useLevelWizardBase(characterId);
  const {
    handleSubmit,
    control,
    watch,
    picked,
    activeStep,
    setActiveStep,
    selectedPowerAptitude,
    selectedPowerLevel,
    debouncedFeatSearch,
    debouncedPowerSearch,
    resetPicks,
    refreshAfterSave,
    handleSaveError,
    setValidationErrors,
    setShowCancelConfirm,
  } = base;

  const attributeStep = EDIT_STEP_CONTENT.indexOf("attributes");
  const skillsStep = EDIT_STEP_CONTENT.indexOf("skills");
  const featsStep = EDIT_STEP_CONTENT.indexOf("feats");
  const powersStep = EDIT_STEP_CONTENT.indexOf("powers");

  const selectedClass = watch("selectedClass");
  const selectedHP = watch("selectedHP");
  const selectedAttribute = watch("selectedAttribute");

  // The HP step's one level, the edited one, its HP the form's field
  const { field: hpField } = useController({ control, name: "selectedHP" });
  const hpLevels: HpLevel[] = selectedClass
    ? [{ className: selectedClass.name, hd: selectedClass.hd, nextLevel: selectedClass.nextLevel }]
    : [];

  // The edited level's class and level, which the slot and picker endpoints take.
  const step: StepLevel = {
    classId: selectedClass?.id,
    level: selectedClass?.nextLevel,
    characterLevelId: editingLevelId,
  };

  const {
    data: attributeData,
    isLoading: isLoadingAttributes,
    error: attributesError,
  } = useQuery({ ...attributeSlotsQuery(characterId, editingLevelId), enabled: open && activeStep === attributeStep });

  const {
    data: skillData,
    isLoading: isLoadingSkills,
    error: skillsError,
  } = useQuery({
    ...skillSlotsQuery(characterId, step, selectedAttribute),
    enabled: open && activeStep === skillsStep,
  });

  // The edited level's class skills and points, which the skills step and the review spend the points over
  const skillLevels = useMemo(() => skillData && editedLevelSkills(skillData), [skillData]);

  const {
    data: featData,
    isLoading: isLoadingFeats,
    error: featsError,
  } = useQuery({ ...featSlotsQuery(characterId, step), enabled: open });

  // The feats, fitted to the level's slots
  const { feats: selectedFeats, pools: adjustedFeatPools } = useMemo(
    () => fitFeats(picked.feats, featData?.aptitudePools),
    [picked.feats, featData],
  );
  const selectedAptitude = openPoolOf(base.selectedAptitude, adjustedFeatPools);
  const allSelectedFeatPickString = useMemo(() => featPickString(selectedFeats), [selectedFeats]);
  const picker: PickerLevel = { ...step, selectedFeatPicks: allSelectedFeatPickString };

  // Grouped available feats
  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    error: availableFeatsError,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    ...availableFeatsGroupedQuery(characterId, selectedAptitude, debouncedFeatSearch, picker),
    enabled: open && activeStep === featsStep,
  });

  // Powers queries
  const {
    data: powerData,
    isLoading: isLoadingPowers,
    error: powersError,
  } = useQuery({ ...powerSlotsQuery(characterId, step), enabled: open });

  const {
    items: availablePowers,
    isLoading: isLoadingAvailablePowers,
    error: availablePowersError,
    onScroll: handlePowersScroll,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useListboxQuery({
    ...availablePowersQuery(characterId, selectedPowerAptitude, selectedPowerLevel, debouncedPowerSearch, picker),
    enabled: open && activeStep === powersStep,
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: LevelUpFormData; force?: boolean }) => {
      if (!data.selectedHP) throw new Error("HP not selected");
      // The picks are saved as the level's slots fit them, which must have loaded
      if (!featData || !powerData) throw new Error("The level hasn't finished loading");
      return parseResponse(
        rpc.api.characters.levels[":characterId"][":characterLevelId"].$put({
          param: { characterId, characterLevelId: editingLevelId },
          json: {
            hp: data.selectedHP,
            abilityId: data.selectedAttribute,
            skills: data.skillPointAllocations,
            feats: pickIds(fitFeats(data.selectedFeats, featData.aptitudePools).feats),
            powers: pickIds(data.selectedPowers),
            force,
          },
        }),
      );
    },
    onSuccess: async () => {
      await refreshAfterSave();
      resetPicks();
      onClose();
    },
    onError: handleSaveError,
  });

  const isLastStep = activeStep === EDIT_STEP_CONTENT.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) handleSubmit((data) => finalizeMutation.mutate({ data }))();
    else setActiveStep((prev) => prev + 1);
  }, [isLastStep, handleSubmit, finalizeMutation, setActiveStep]);

  // Through the form, so its own rules still hold on a forced save, as on any other
  const handleForceSubmit = useCallback(() => {
    setValidationErrors([]);
    handleSubmit((data) => finalizeMutation.mutate({ data, force: true }))();
  }, [finalizeMutation, handleSubmit, setValidationErrors]);

  const handleCancel = useCallback(() => {
    setShowCancelConfirm(true);
  }, [setShowCancelConfirm]);

  const handleConfirmCancel = useCallback(() => {
    resetPicks();
    onClose();
  }, [resetPicks, onClose]);

  // The dialog also disables Next while the save runs.
  const isNextDisabled = EDIT_STEP_CONTENT[activeStep] === "hp" && !hpSet(hpLevels, [selectedHP]);

  return {
    ...base,
    selectedFeats,
    selectedPowers: picked.powers,
    skillPointAllocations: picked.skillPoints,
    selectedAptitude,
    featPicker: picker,
    selectedClass,
    selectedHP,
    selectedAttribute,
    isLastStep,

    hpLevels,
    hpValues: [selectedHP],
    handleHpChange: (_index: number, hp: number | null) => hpField.onChange(hp),
    hpInputRef: hpField.ref,

    attributeData,
    isLoadingAttributes,
    attributesError,
    skillData,
    isLoadingSkills,
    skillsError,
    skillLevels,
    featData,
    isLoadingFeats,
    featsError,
    groupedFeats,
    isLoadingAvailableFeats,
    availableFeatsError,
    isFetchingNextFeatsPage,
    powerData,
    isLoadingPowers,
    powersError,
    availablePowers,
    isLoadingAvailablePowers,
    availablePowersError,
    isFetchingNextPowersPage,

    finalizeMutation,

    handleNext,
    handleCancel,
    handleConfirmCancel,
    handleForceSubmit,
    handleFeatsScroll,
    handlePowersScroll,

    adjustedFeatPools,
    isNextDisabled,
  };
}
