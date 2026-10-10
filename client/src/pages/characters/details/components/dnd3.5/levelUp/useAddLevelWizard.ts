import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo, useRef, useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import {
  type AvailableKlass,
  pickIds,
  type SelectedKlass,
  useLevelWizardBase,
} from "@/client/src/pages/characters/details/components/useLevelWizardBase.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { plannedLevel, plannedSlotKeys } from "./classPlan.ts";
import { fitSkillPoints, keepFitted, openPoolOf } from "./fitPicks.ts";
import { type HpLevel, hpSet } from "./hitPoints.ts";
import {
  availableClassesQuery,
  availableFeatsGroupedQuery,
  availablePowersQuery,
  type ClassPicker,
  levelPreviewQuery,
  levelStepsQuery,
} from "./levelUpQueries.ts";
import {
  abilityIncreasesOf,
  featPickString,
  plannedLevelsOf,
  plannedPicker,
  powerPickString,
  skillPointString,
} from "./pendingPicks.ts";
import { CLASS_PLAN_STEP, HP_STEP, REVIEW_STEP } from "./wizardSteps.ts";

interface UseAddLevelWizardParams {
  characterId: string;
  onClose: () => void;
  open: boolean;
}

/** The Add Level wizard's state: what its dialog and its steps read. */
export type AddLevelWizard = ReturnType<typeof useAddLevelWizard>;

export function useAddLevelWizard({ open, onClose, characterId }: UseAddLevelWizardParams) {
  const snackbar = useSnackbar();
  const base = useLevelWizardBase(characterId);
  const {
    picked,
    activeStep,
    setActiveStep,
    selectedPowerAptitude,
    selectedPowerLevel,
    setShowCancelConfirm,
    debouncedFeatSearch,
    debouncedPowerSearch,
    setIssues,
    resetPicks,
    refreshAfterSave,
    handleSaveError,
  } = base;

  // Its steps: its class plan and hit points, the steps the ruleset lists for a new level, then its review
  const stepsQuery = useQuery({ ...levelStepsQuery(characterId), enabled: open });
  const steps = useMemo(() => [CLASS_PLAN_STEP, HP_STEP, ...(stepsQuery.data ?? []), REVIEW_STEP], [stepsQuery.data]);
  const stepName = steps[activeStep].name;

  const [klassSearch, setKlassSearch] = useState("");
  const debouncedKlassSearch = useDebouncedValue(klassSearch);
  const slotCounter = useRef(0);
  const [slotKeys, setSlotKeys] = useState<number[]>([]);
  const [classPlan, setClassPlan] = useState<(SelectedKlass | null)[]>([]);
  // Each planned level's hit points and ability increase, by its slot's key
  const [hpBySlot, setHpBySlot] = useState<Record<number, number | null>>({});
  const [abilityBySlot, setAbilityBySlot] = useState<Record<number, string>>({});

  const handleClassChange = (index: number, klass: SelectedKlass | null) => {
    const next = [...classPlan];
    next[index] = klass;
    setClassPlan(next);
  };

  // Each class at the level it takes in the plan: a class planned again takes the level after
  const adjustedClassPlan = useMemo(
    () => classPlan.map((k, index) => k && { ...k, nextLevel: plannedLevel(k, classPlan, index) }),
    [classPlan],
  );

  const handleAddLevel = useCallback(() => {
    const key = slotCounter.current++;
    setSlotKeys((prev) => [...prev, key]);
    setClassPlan((prev) => [...prev, null]);
  }, []);

  const handleQuickAddLevel = useCallback((klass: SelectedKlass) => {
    const key = slotCounter.current++;
    setSlotKeys((prev) => [...prev, key]);
    setClassPlan((prev) => [...prev, klass]);
  }, []);

  // A removed slot's hit points and ability increase go with its key
  const handleRemoveLevel = useCallback((index: number) => {
    setClassPlan((prev) => prev.filter((_, i) => i !== index));
    setSlotKeys((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Only non-null entries matter for downstream steps
  const validClassPlan = useMemo(() => classPlan.filter((k): k is SelectedKlass => k !== null), [classPlan]);
  // The planned levels' slots, by which their hit points and ability increases are kept
  const levelKeys = useMemo(() => plannedSlotKeys(classPlan, slotKeys), [classPlan, slotKeys]);
  const hpValues = useMemo(() => levelKeys.map((key) => hpBySlot[key] ?? null), [levelKeys, hpBySlot]);

  const handleHpChange = useCallback(
    (index: number, value: number | null) => setHpBySlot((prev) => ({ ...prev, [levelKeys[index]]: value })),
    [levelKeys],
  );

  const handleAbilityIncreaseChange = useCallback(
    (index: number, abilityId: string) => setAbilityBySlot((prev) => ({ ...prev, [levelKeys[index]]: abilityId })),
    [levelKeys],
  );

  // In plan order: the preview's levels pair by index with the plan's HP and ability increases. Each takes its slot's
  // ability, which the preview raises at a level that takes an increase only
  const plannedLevels = useMemo(
    () =>
      adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k, index) => ({
          klassId: k.id,
          level: k.nextLevel,
          abilityIncreases: abilityIncreasesOf(abilityBySlot[levelKeys[index]]),
        })),
    [adjustedClassPlan, abilityBySlot, levelKeys],
  );
  // The skill points spent so far, which the preview says what they come to: sent once the typing settles
  const debouncedSkillPoints = useDebouncedValue(picked.skillPoints);
  // The feats and spells picked so far, which the preview fits to their pools
  const pickedIds = useMemo(
    () => ({ feats: pickIds(picked.feats), powers: pickIds(picked.powers) }),
    [picked.feats, picked.powers],
  );

  const previewQuery = useQuery({
    ...levelPreviewQuery(characterId, plannedLevels, { ...pickedIds, skills: debouncedSkillPoints }),
    enabled: open && validClassPlan.length >= 1 && activeStep > 0,
    placeholderData: keepPreviousData,
  });

  // Attribute data (from preview)
  const abilityIncreaseLevels = useMemo(
    () => previewQuery.data?.attributes.abilityIncreaseLevels ?? [],
    [previewQuery.data],
  );
  // Each planned level's ability increase: its slot's, while the level is one that takes an increase
  const abilityIncreases = useMemo(
    () => levelKeys.map((key, index) => (abilityIncreaseLevels.includes(index) ? (abilityBySlot[key] ?? null) : null)),
    [levelKeys, abilityBySlot, abilityIncreaseLevels],
  );

  // The character's abilities with the plan's increases, at the levels that take one
  const attributeData = useMemo(() => {
    if (!previewQuery.data) return undefined;
    if (abilityIncreaseLevels.length === 0) return { isAvailable: false as const, attributes: {} };
    return { isAvailable: true as const, attributes: previewQuery.data.attributes.attributes };
  }, [previewQuery.data, abilityIncreaseLevels]);

  // The planned levels whose hit points the HP step sets, as the preview lists them, with the hit points each may gain
  const hpLevels = useMemo<HpLevel[]>(
    () =>
      (previewQuery.data?.levelDetails ?? []).map((detail) => ({
        className: detail.klassName,
        hd: detail.hd,
        hitPoints: detail.hitPoints,
        nextLevel: detail.level,
      })),
    [previewQuery.data],
  );

  const isLoadingAttributes = previewQuery.isLoading;
  const attributesError = previewQuery.error;

  // The skill points to spend over the planned levels, and each skill's spending, with the plan's increases
  const skillData = previewQuery.data?.skills ?? null;

  const isLoadingSkills = previewQuery.isLoading;
  const skillsError = previewQuery.error;

  // Feat data (from preview)
  const featData = useMemo(() => previewQuery.data?.feats ?? null, [previewQuery.data]);

  const isLoadingFeats = previewQuery.isLoading;
  const featsError = previewQuery.error;

  // Power data (from preview)
  const powerData = useMemo(() => previewQuery.data?.powers ?? null, [previewQuery.data]);

  // The picks the preview fits to the plan's pools: while it answers for earlier picks, they stand
  const fittedFor = previewQuery.isPlaceholderData ? undefined : previewQuery.data;
  const selectedFeats = useMemo(() => keepFitted(picked.feats, fittedFor?.feats.fitted), [picked.feats, fittedFor]);
  const selectedPowers = useMemo(() => keepFitted(picked.powers, fittedFor?.powers.fitted), [picked.powers, fittedFor]);
  const featPools = useMemo(() => featData?.aptitudePools ?? {}, [featData]);
  const skillPointAllocations = useMemo(
    () => fitSkillPoints(picked.skillPoints, skillData?.skills),
    [picked.skillPoints, skillData],
  );
  const selectedAptitude = openPoolOf(base.selectedAptitude, featPools);
  const allSelectedFeatPickString = useMemo(() => featPickString(selectedFeats), [selectedFeats]);

  const isLoadingPowers = previewQuery.isLoading;
  const powersError = previewQuery.error;

  // The planned levels, not saved yet, which the pickers check their options after
  const previewLevelDetails = previewQuery.data?.levelDetails;
  // The class picker's: every planned level, and what's picked over them so far
  const classPicker: ClassPicker = {
    ...plannedLevelsOf(previewLevelDetails, abilityIncreases),
    featPicks: allSelectedFeatPickString,
    skillPoints: skillPointString(skillPointAllocations),
  };

  const {
    items: availableKlasses,
    isLoading: isLoadingKlasses,
    error: klassesError,
    onScroll: handleKlassesScroll,
  } = useListboxQuery({
    ...availableClassesQuery(characterId, debouncedKlassSearch, classPicker),
    enabled: open && stepName === "class-plan",
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
  const nextPickLevels = previewQuery.data?.nextPickLevels;
  const featPicker = plannedPicker(
    previewLevelDetails,
    abilityIncreases,
    selectedAptitude ? (nextPickLevels?.feats[selectedAptitude] ?? 0) : 0,
    allSelectedFeatPickString,
  );

  // The level the next spell pick lands on, in the open pool at its open spell level
  const powerPicker = plannedPicker(
    previewLevelDetails,
    abilityIncreases,
    selectedPowerAptitude ? (nextPickLevels?.powers[selectedPowerAptitude]?.[selectedPowerLevel ?? ""] ?? 0) : 0,
    allSelectedFeatPickString,
  );

  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    error: availableFeatsError,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    ...availableFeatsGroupedQuery(characterId, selectedAptitude, debouncedFeatSearch, featPicker),
    enabled: open && stepName === "feats",
  });

  const {
    items: availablePowers,
    isLoading: isLoadingAvailablePowers,
    error: availablePowersError,
    onScroll: handlePowersScroll,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useListboxQuery({
    ...availablePowersQuery(characterId, selectedPowerAptitude, selectedPowerLevel, debouncedPowerSearch, {
      ...powerPicker,
      selectedPowerIds: powerPickString(selectedPowers),
    }),
    enabled: open && stepName === "powers",
  });

  const resetWizard = useCallback(() => {
    resetPicks();
    setKlassSearch("");
    slotCounter.current = 0;
    setSlotKeys([]);
    setClassPlan([]);
    setHpBySlot({});
    setAbilityBySlot({});
  }, [resetPicks]);

  // Pool-level picks; the backend distributes them to the levels.
  const finalizeMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      // The plan's levels as its preview lists them, each with its HP: Next waits for both
      const preview = previewQuery.data;
      if (!preview || !hpSet(hpLevels, hpValues)) throw new Error("The plan isn't ready to save");
      const levels = preview.levelDetails.map((detail, i) => ({
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
      resetWizard();
      onClose();
    },
    onError: handleSaveError,
  });

  const isLastStep = activeStep === steps.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) finalizeMutation.mutate({ force: false });
    else setActiveStep((prev) => prev + 1);
  }, [isLastStep, finalizeMutation, setActiveStep]);

  const handleForceSubmit = useCallback(() => {
    setIssues([]);
    finalizeMutation.mutate({ force: true });
  }, [finalizeMutation, setIssues]);

  const hasProgress = activeStep > 0 || classPlan.some((k) => k !== null);

  const handleCancel = useCallback(() => {
    if (hasProgress) setShowCancelConfirm(true);
    else onClose();
  }, [hasProgress, onClose, setShowCancelConfirm]);

  const handleConfirmCancel = useCallback(() => {
    resetWizard();
    onClose();
  }, [resetWizard, onClose]);

  // Next waits for the steps the ruleset lists. The dialog also disables it while the save runs.
  const isNextDisabled = useMemo(() => {
    if (!stepsQuery.data) return true;
    switch (stepName) {
      case "class-plan":
        return validClassPlan.length < 1;
      case "hp":
        return !hpSet(hpLevels, hpValues);
      default:
        return false;
    }
  }, [stepsQuery.data, stepName, validClassPlan, hpLevels, hpValues]);

  // The steps' list failed to load: the wizard can't go on
  const loadError = !stepsQuery.data && stepsQuery.error ? { what: "Steps", error: stepsQuery.error } : undefined;

  return {
    ...base,
    steps,
    loadError,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
    selectedAptitude,
    isLastStep,

    // Class plan
    classPlan: adjustedClassPlan,
    slotKeys,
    handleClassChange,
    handleAddLevel,
    handleQuickAddLevel,
    handleRemoveLevel,
    availableKlasses,
    quickAddKlasses,
    isLoadingKlasses,
    klassesError,
    handleKlassesScroll,
    setKlassSearch,

    // HP
    hpValues,
    handleHpChange,
    hpLevels,

    // Ability increases
    attributeData,
    isLoadingAttributes,
    attributesError,
    abilityIncreaseLevels,
    abilityIncreases,
    handleAbilityIncreaseChange,

    // Skills
    skillData,
    isLoadingSkills,
    skillsError,

    // Feats
    featData,
    isLoadingFeats,
    featsError,
    featPools,
    groupedFeats,
    isLoadingAvailableFeats,
    availableFeatsError,
    isFetchingNextFeatsPage,
    featPicker,
    handleFeatsScroll,

    // Powers
    powerData,
    isLoadingPowers,
    powersError,
    availablePowers,
    isLoadingAvailablePowers,
    availablePowersError,
    isFetchingNextPowersPage,
    handlePowersScroll,

    handleNext,
    handleCancel,
    handleConfirmCancel,
    handleForceSubmit,
    isNextDisabled,

    finalizeMutation,

    levelDetails: previewQuery.data?.levelDetails ?? [],
  };
}
