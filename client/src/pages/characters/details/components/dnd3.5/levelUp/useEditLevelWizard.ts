import { useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo } from "react";
import { useController } from "react-hook-form";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync, useListboxQuery } from "@/client/src/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { fitFeats, fitPowers, fitSkillPoints, openPoolOf } from "./fitPicks.ts";
import { type HpLevel, hpSet } from "./hitPoints.ts";
import {
  abilityStepQuery,
  availableFeatsGroupedQuery,
  availablePowersQuery,
  characterLevelQuery,
  featStepQuery,
  type PickerLevel,
  powerStepQuery,
  skillStepQuery,
  type StepLevel,
} from "./levelUpQueries.ts";
import { featPickString, powerPickString } from "./pendingPicks.ts";
import { editedLevelSkills } from "./skillLevels.ts";
import { type LevelUpFormData, pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";

interface UseEditLevelWizardParams {
  characterId: string;
  /** The level it edits, as the sheet lists it: its class, which the saved picks take. */
  editingLevel: EditingLevel;
  onClose: () => void;
  open: boolean;
}

/** The Edit Level wizard's state: what its dialog and its steps read. */
export type EditLevelWizard = ReturnType<typeof useEditLevelWizard>;

export const EDIT_STEP_CONTENT = ["hp", "abilities", "skills", "feats", "powers", "review"] as const;

export const EDIT_STEP_LABELS = [
  "Select HP",
  "Ability Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

export function useEditLevelWizard({ open, onClose, characterId, editingLevel }: UseEditLevelWizardParams) {
  const editingLevelId = editingLevel.characterLevelId;
  const snackbar = useSnackbar();
  const base = useLevelWizardBase(characterId);
  const {
    form,
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
    setIssues,
    setShowCancelConfirm,
  } = base;

  const abilityStep = EDIT_STEP_CONTENT.indexOf("abilities");
  const skillsStep = EDIT_STEP_CONTENT.indexOf("skills");
  const featsStep = EDIT_STEP_CONTENT.indexOf("feats");
  const powersStep = EDIT_STEP_CONTENT.indexOf("powers");

  const {
    data: levelData,
    isLoading: isLoadingLevel,
    error: levelError,
  } = useQuery({ ...characterLevelQuery(characterId, editingLevelId), enabled: open });

  // The saved level, as the wizard's picks: the form takes them once it loads
  const savedPicks = useMemo<LevelUpFormData | undefined>(
    () =>
      levelData && {
        selectedClass: {
          id: editingLevel.klassId,
          name: editingLevel.klassName,
          nextLevel: editingLevel.level,
          maxLevel: editingLevel.level,
          hd: editingLevel.hd,
          eligible: true,
        },
        selectedHP: levelData.hp,
        selectedAttribute: levelData.abilityId,
        selectedFeats: levelData.feats,
        selectedPowers: levelData.powers,
        skillPointAllocations: levelData.skills,
      },
    [levelData, editingLevel],
  );
  const sync = useFormSync(form, savedPicks, { key: editingLevelId });

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
    editedLevelId: editingLevelId,
  };

  const {
    data: attributeData,
    isLoading: isLoadingAttributes,
    error: attributesError,
  } = useQuery({ ...abilityStepQuery(characterId, editingLevelId), enabled: open && activeStep === abilityStep });

  const {
    data: skillData,
    isLoading: isLoadingSkills,
    error: skillsError,
  } = useQuery({
    ...skillStepQuery(characterId, step, selectedAttribute),
    enabled: open && activeStep === skillsStep,
  });

  // The edited level's class skills and points, which the skills step and the review spend the points over
  const skillLevels = useMemo(() => skillData && editedLevelSkills(skillData), [skillData]);
  // The skill points, fitted to the level's: its ability increase changes how many it has
  const skillPointAllocations = useMemo(
    () => fitSkillPoints(picked.skillPoints, skillData, skillLevels),
    [picked.skillPoints, skillData, skillLevels],
  );

  const {
    data: featData,
    isLoading: isLoadingFeats,
    error: featsError,
  } = useQuery({ ...featStepQuery(characterId, step), enabled: open });

  // The feats, fitted to the level's slots
  const { feats: selectedFeats, pools: adjustedFeatPools } = useMemo(
    () => fitFeats(picked.feats, featData?.aptitudePools),
    [picked.feats, featData],
  );
  const selectedAptitude = openPoolOf(base.selectedAptitude, adjustedFeatPools);
  const allSelectedFeatPickString = useMemo(() => featPickString(selectedFeats), [selectedFeats]);
  const picker: PickerLevel = {
    ...step,
    abilityId: selectedAttribute ?? undefined,
    featPicks: allSelectedFeatPickString,
  };

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
  } = useQuery({ ...powerStepQuery(characterId, step), enabled: open });

  // The spells, fitted to the level's slots
  const selectedPowers = useMemo(() => fitPowers(picked.powers, powerData?.aptitudePools), [picked.powers, powerData]);

  const {
    items: availablePowers,
    isLoading: isLoadingAvailablePowers,
    error: availablePowersError,
    onScroll: handlePowersScroll,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useListboxQuery({
    ...availablePowersQuery(characterId, selectedPowerAptitude, selectedPowerLevel, debouncedPowerSearch, {
      ...picker,
      selectedPowerIds: powerPickString(selectedPowers),
    }),
    enabled: open && activeStep === powersStep,
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: LevelUpFormData; force?: boolean }) => {
      // Next waits for the level's HP and its slots (the feats', the spells', the skills'), which the picks are saved as
      // they fit
      if (data.selectedHP === null || !featData || !powerData || !skillData)
        throw new Error("The level isn't ready to save");
      return parseResponse(
        rpc.api.characters.levels[":characterId"][":characterLevelId"].$put({
          param: { characterId, characterLevelId: editingLevelId },
          json: {
            hp: data.selectedHP,
            abilityId: data.selectedAttribute,
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

  const isLastStep = activeStep === EDIT_STEP_CONTENT.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) handleSubmit((data) => finalizeMutation.mutate({ data }))();
    else setActiveStep((prev) => prev + 1);
  }, [isLastStep, handleSubmit, finalizeMutation, setActiveStep]);

  // Through the form, so its own rules still hold on a forced save, as on any other
  const handleForceSubmit = useCallback(() => {
    setIssues([]);
    handleSubmit((data) => finalizeMutation.mutate({ data, force: true }))();
  }, [finalizeMutation, handleSubmit, setIssues]);

  // Changed picks ask before they're discarded, as Add Level's plan does
  const handleCancel = useCallback(() => {
    if (sync.isDirty) setShowCancelConfirm(true);
    else onClose();
  }, [sync.isDirty, onClose, setShowCancelConfirm]);

  const handleConfirmCancel = useCallback(() => {
    resetPicks();
    onClose();
  }, [resetPicks, onClose]);

  // The saved level fills the picks in as it loads, and its class's slots, which load after it, fit its picks: Next
  // waits for its feat and power slots both, the Skills step for its skill slots, and a load that failed stops the
  // wizard at the step that shows its error. The dialog also disables it while the save runs.
  const content = EDIT_STEP_CONTENT[activeStep];
  const loading = isLoadingLevel || (!!levelData && !selectedClass) || isLoadingFeats || isLoadingPowers;
  const failed =
    !levelData ||
    (content === "skills" && !skillData) ||
    (content === "feats" && !featData) ||
    (content === "powers" && !powerData);
  const isNextDisabled = loading || failed || (content === "hp" && !hpSet(hpLevels, [selectedHP]));

  return {
    ...base,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
    selectedAptitude,
    featPicker: picker,
    selectedClass,
    selectedHP,
    selectedAttribute,
    isLastStep,
    levelData,
    levelError,

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
