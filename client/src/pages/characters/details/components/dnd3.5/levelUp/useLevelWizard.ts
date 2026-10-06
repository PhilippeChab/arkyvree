import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { rollDie } from "@/client/src/lib/dice.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { getLevelUpSections } from "@/client/src/pages/characters/details/components/dnd3.5/levelUpFactory.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { featPickString, fitFeats, openPoolOf } from "./fitPicks.ts";
import type { BaseRules, LevelUpFormData } from "./levelUpTypes.ts";
import { pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";

interface UseLevelWizardParams {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
  editingLevelId: string;
}

export type LevelWizard = ReturnType<typeof useLevelWizard>;

export const editStepContent = ["hp", "attributes", "skills", "feats", "powers", "review"] as const;

export const editStepLabels = [
  "Select HP",
  "Attribute Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

export function useLevelWizard({ open, onClose, characterId, baseRules, editingLevelId }: UseLevelWizardParams) {
  const base = useLevelWizardBase(characterId);
  const {
    handleSubmit,
    getValues,
    setValue,
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
  const levelUpSections = getLevelUpSections(baseRules);

  const attributeStep = editStepContent.indexOf("attributes");
  const skillsStep = editStepContent.indexOf("skills");
  const featsStep = editStepContent.indexOf("feats");
  const powersStep = editStepContent.indexOf("powers");

  // HP roll animation
  const [hpRolling, setHpRolling] = useState(false);
  const [hpSettled, setHpSettled] = useState(false);
  const [hpDisplayValue, setHpDisplayValue] = useState<number | null>(null);
  const hpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupHpRoll = useCallback(() => {
    if (hpIntervalRef.current) {
      clearInterval(hpIntervalRef.current);
      hpIntervalRef.current = null;
    }
    if (hpTimeoutRef.current) {
      clearTimeout(hpTimeoutRef.current);
      hpTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cleanupHpRoll, [cleanupHpRoll]);

  const selectedClass = watch("selectedClass");
  const selectedHP = watch("selectedHP");
  const selectedAttribute = watch("selectedAttribute");

  const levels = rpc.api.characters.levels[":characterId"];
  const param = { characterId };
  // The edited level's class and level, which the slot and picker endpoints take.
  const levelQuery = selectedClass && {
    classId: selectedClass.id,
    level: selectedClass.nextLevel.toString(),
    characterLevelId: editingLevelId,
  };

  const {
    data: attributeData,
    isLoading: isLoadingAttributes,
    error: attributesError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.attributes(characterId, editingLevelId),
    queryFn:
      open && activeStep === attributeStep
        ? () => parseResponse(levels["attribute-slots"].$get({ param, query: { characterLevelId: editingLevelId } }))
        : skipToken,
  });

  const {
    data: skillData,
    isLoading: isLoadingSkills,
    error: skillsError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.skills(characterId, selectedClass?.id, editingLevelId, selectedAttribute),
    queryFn:
      open && activeStep === skillsStep && levelQuery
        ? () =>
            parseResponse(
              levels["skill-slots"].$get({
                param,
                query: { ...levelQuery, abilityId: selectedAttribute || undefined },
              }),
            )
        : skipToken,
  });

  const {
    data: featData,
    isLoading: isLoadingFeats,
    error: featsError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.feats(characterId, selectedClass?.id, editingLevelId),
    queryFn:
      open && levelQuery ? () => parseResponse(levels["feat-slots"].$get({ param, query: levelQuery })) : skipToken,
  });

  // The feats, fitted to the level's slots
  const { feats: selectedFeats, pools: adjustedFeatPools } = useMemo(
    () => fitFeats(picked.feats, featData?.aptitudePools),
    [picked.feats, featData],
  );
  const selectedAptitude = openPoolOf(base.selectedAptitude, adjustedFeatPools);
  const allSelectedFeatPickString = useMemo(() => featPickString(selectedFeats), [selectedFeats]);

  // Grouped available feats
  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    queryKey: queryKeys.characters.levelUp.availableFeatsGrouped(
      characterId,
      selectedAptitude,
      selectedClass?.id,
      debouncedFeatSearch,
      editingLevelId,
      allSelectedFeatPickString,
    ),
    queryFn:
      open && activeStep === featsStep && selectedAptitude && levelQuery
        ? ({ pageParam }) =>
            parseResponse(
              levels["available-feats"].grouped.$get({
                param,
                query: {
                  ...levelQuery,
                  aptitudeId: selectedAptitude,
                  limit: "20",
                  page: pageParam.toString(),
                  search: debouncedFeatSearch || undefined,
                  selectedFeatPicks: allSelectedFeatPickString || undefined,
                },
              }),
            )
        : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  // Powers queries
  const {
    data: powerData,
    isLoading: isLoadingPowers,
    error: powersError,
  } = useQuery({
    queryKey: queryKeys.characters.levelUp.powers(characterId, selectedClass?.id, editingLevelId),
    queryFn:
      open && levelQuery ? () => parseResponse(levels["power-slots"].$get({ param, query: levelQuery })) : skipToken,
  });

  const {
    items: availablePowers,
    isLoading: isLoadingAvailablePowers,
    onScroll: handlePowersScroll,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useListboxQuery({
    queryKey: queryKeys.characters.levelUp.availablePowers(
      characterId,
      selectedPowerAptitude,
      selectedPowerLevel,
      selectedClass?.id,
      debouncedPowerSearch,
      editingLevelId,
      allSelectedFeatPickString,
    ),
    queryFn:
      open && activeStep === powersStep && selectedPowerAptitude && levelQuery
        ? ({ pageParam }) =>
            parseResponse(
              levels["available-powers"].$get({
                param,
                query: {
                  ...levelQuery,
                  aptitudeId: selectedPowerAptitude,
                  powerLevel: selectedPowerLevel?.toString(),
                  limit: "20",
                  page: pageParam.toString(),
                  search: debouncedPowerSearch || undefined,
                  selectedFeatPicks: allSelectedFeatPickString || undefined,
                },
              }),
            )
        : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const finalizeMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: LevelUpFormData; force?: boolean }) => {
      if (!data.selectedHP) throw new Error("HP not selected");
      // The picks are saved as the level's slots fit them, which must have loaded
      if (!featData || !powerData) throw new Error("The level hasn't finished loading");
      return parseResponse(
        rpc.api.characters.levels[":characterId"][":characterLevelId"]["$put"]({
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

  const isLastStep = activeStep === editStepContent.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleSubmit((data) => finalizeMutation.mutate({ data }))();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  }, [isLastStep, handleSubmit, finalizeMutation, setActiveStep]);

  const handleForceSubmit = useCallback(() => {
    setValidationErrors([]);
    finalizeMutation.mutate({ data: getValues(), force: true });
  }, [finalizeMutation, getValues, setValidationErrors]);

  const handleCancel = useCallback(() => {
    setShowCancelConfirm(true);
  }, [setShowCancelConfirm]);

  const handleConfirmCancel = useCallback(() => {
    resetPicks();
    onClose();
  }, [resetPicks, onClose]);

  // HP roll trigger
  const triggerHpRoll = useCallback(
    (hd: number) => {
      if (hpRolling) return;
      cleanupHpRoll();
      setHpRolling(true);
      setHpSettled(false);

      hpIntervalRef.current = setInterval(() => {
        setHpDisplayValue(rollDie(hd));
      }, 50);

      hpTimeoutRef.current = setTimeout(() => {
        cleanupHpRoll();
        const result = rollDie(hd);
        setHpDisplayValue(result);
        setValue("selectedHP", result);
        setHpRolling(false);
        setHpSettled(true);
        hpTimeoutRef.current = setTimeout(() => setHpSettled(false), 400);
      }, 800);
    },
    [hpRolling, cleanupHpRoll, setValue],
  );

  // The dialog also disables Next while the save runs.
  const isNextDisabled = editStepContent[activeStep] === "hp" && !selectedHP;

  return {
    ...base,
    selectedFeats,
    selectedPowers: picked.powers,
    skillPointAllocations: picked.skillPoints,
    selectedAptitude,
    allSelectedFeatPickString,
    selectedClass,
    selectedHP,
    selectedAttribute,
    isLastStep,

    hpRolling,
    hpSettled,
    hpDisplayValue,
    triggerHpRoll,

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
    isFetchingNextFeatsPage,
    powerData,
    isLoadingPowers,
    powersError,
    availablePowers,
    isLoadingAvailablePowers,
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
    levelUpSections,
  };
}
