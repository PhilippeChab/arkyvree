import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo } from "react";
import { useController } from "react-hook-form";

import type { EditingLevel } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useFormSync, useListboxQuery } from "@/client/src/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { fitSkillPoints, keepFitted, openPoolOf } from "./fitPicks.ts";
import { type HpLevel, hpSet } from "./hitPoints.ts";
import {
  availableFeatsGroupedQuery,
  availablePowersQuery,
  characterLevelQuery,
  levelStepQuery,
  levelStepsQuery,
  type PickerLevel,
  type StepLevel,
} from "./levelUpQueries.ts";
import {
  abilityIncreasesOf,
  featPickString,
  pickPairString,
  powerPickString,
  skillPointString,
} from "./pendingPicks.ts";
import { type LevelUpFormData, pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";
import { HP_STEP, REVIEW_STEP } from "./wizardSteps.ts";

interface UseEditLevelWizardParams {
  characterId: string;
  /** The level it edits, as the sheet lists it: its class, which the saved picks take. */
  editingLevel: EditingLevel;
  onClose: () => void;
  open: boolean;
}

/** The Edit Level wizard's state: what its dialog and its steps read. */
export type EditLevelWizard = ReturnType<typeof useEditLevelWizard>;

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

  // Its steps: the level's hit points, the steps the ruleset lists for the edited level, then its review
  const stepsQuery = useQuery({ ...levelStepsQuery(characterId, editingLevelId), enabled: open });
  const steps = useMemo(() => [HP_STEP, ...(stepsQuery.data ?? []), REVIEW_STEP], [stepsQuery.data]);
  const stepName = steps[activeStep].name;

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
        selectedAttribute: levelData.abilityIncreases[0]?.abilityId ?? null,
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
  const hpLevels: HpLevel[] =
    selectedClass && levelData
      ? [
          {
            className: selectedClass.name,
            hd: selectedClass.hd,
            hitPoints: levelData.hitPoints,
            nextLevel: selectedClass.nextLevel,
          },
        ]
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
  } = useQuery({ ...levelStepQuery(characterId, "abilities", step), enabled: open && stepName === "abilities" });

  // The edited level with its ability increase, which its skill points, its slots and its pickers' options read
  const increasedStep: StepLevel = { ...step, abilityId: selectedAttribute ?? undefined };

  // The skill points spent so far, which the skills step says what they come to: sent once the typing settles, the
  // step's last answer kept meanwhile
  const debouncedSkillPoints = useDebouncedValue(picked.skillPoints);
  const {
    data: skillData,
    isLoading: isLoadingSkills,
    error: skillsError,
  } = useQuery({
    ...levelStepQuery(characterId, "skills", { ...increasedStep, skillPoints: skillPointString(debouncedSkillPoints) }),
    enabled: open && stepName === "skills",
    placeholderData: keepPreviousData,
  });

  // The skill points, fitted to the level's: its ability increase changes how many it has
  const skillPointAllocations = useMemo(
    () => fitSkillPoints(picked.skillPoints, skillData?.skills),
    [picked.skillPoints, skillData],
  );

  // The level with its feats and spells, which its feat and spell steps fit to their pools: each step's last answer kept
  // while it answers for the new picks, which stand meanwhile
  const pickedStep: StepLevel = {
    ...increasedStep,
    picks: { feats: pickPairString(picked.feats), powers: pickPairString(picked.powers) },
  };
  const featQuery = useQuery({
    ...levelStepQuery(characterId, "feats", pickedStep),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const { data: featData, isLoading: isLoadingFeats, error: featsError } = featQuery;

  // The feats that fit the level's pools
  const selectedFeats = useMemo(
    () => keepFitted(picked.feats, featQuery.isPlaceholderData ? undefined : featData?.fitted),
    [picked.feats, featQuery.isPlaceholderData, featData],
  );
  const featPools = useMemo(() => featData?.aptitudePools ?? {}, [featData]);
  const selectedAptitude = openPoolOf(base.selectedAptitude, featPools);
  const allSelectedFeatPickString = useMemo(() => featPickString(selectedFeats), [selectedFeats]);
  const picker: PickerLevel = { ...increasedStep, featPicks: allSelectedFeatPickString };

  // Grouped available feats
  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    error: availableFeatsError,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    ...availableFeatsGroupedQuery(characterId, selectedAptitude, debouncedFeatSearch, picker),
    enabled: open && stepName === "feats",
  });

  const powerQuery = useQuery({
    ...levelStepQuery(characterId, "powers", pickedStep),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const { data: powerData, isLoading: isLoadingPowers, error: powersError } = powerQuery;

  // The spells that fit the level's pools
  const selectedPowers = useMemo(
    () => keepFitted(picked.powers, powerQuery.isPlaceholderData ? undefined : powerData?.fitted),
    [picked.powers, powerQuery.isPlaceholderData, powerData],
  );

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
    enabled: open && stepName === "powers",
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

  const isLastStep = activeStep === steps.length - 1;

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
  // waits for the steps the ruleset lists, its feat and power slots both, the Skills step for its skill slots, and a
  // load that failed stops the wizard at the step that shows its error. The dialog also disables it while the save runs.
  const loading = isLoadingLevel || (!!levelData && !selectedClass) || isLoadingFeats || isLoadingPowers;
  const failed =
    !levelData ||
    !stepsQuery.data ||
    (stepName === "skills" && !skillData) ||
    (stepName === "feats" && !featData) ||
    (stepName === "powers" && !powerData);
  const isNextDisabled = loading || failed || (stepName === "hp" && !hpSet(hpLevels, [selectedHP]));

  // The saved level, or the steps' list, failed to load: the wizard can't go on
  const loadError =
    (!levelData && levelError && { what: "Level", error: levelError }) ||
    (!stepsQuery.data && stepsQuery.error && { what: "Steps", error: stepsQuery.error }) ||
    undefined;

  return {
    ...base,
    steps,
    loadError,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
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

    featPools,
    isNextDisabled,
  };
}
