import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo, useRef, useState } from "react";

import { computeAbilityModifier } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { computeLevelSkillPoints } from "@/shared/dnd3.5/skills.ts";

import { plannedLevel, plannedSlotKeys } from "./classPlan.ts";
import { fitFeats, fitPowers, fitSkillPoints, openPoolOf } from "./fitPicks.ts";
import { type HpLevel, hpSet } from "./hitPoints.ts";
import {
  availableClassesQuery,
  availableFeatsGroupedQuery,
  type AvailableKlass,
  availablePowersQuery,
  type ClassPicker,
  levelPreviewQuery,
  levelStepsQuery,
  type SelectedKlass,
} from "./levelUpQueries.ts";
import {
  featPickString,
  nextPickLevel,
  plannedLevelsOf,
  plannedPicker,
  powerPickString,
  skillPointString,
  spellSlotsPerLevel,
} from "./pendingPicks.ts";
import type { SkillLevels } from "./skillLevels.ts";
import { pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";
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

  const hpLevels = useMemo<HpLevel[]>(
    () =>
      adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => ({ className: k.name, hd: k.hd, nextLevel: k.nextLevel })),
    [adjustedClassPlan],
  );

  const handleAbilityIncreaseChange = useCallback(
    (index: number, abilityId: string) => setAbilityBySlot((prev) => ({ ...prev, [levelKeys[index]]: abilityId })),
    [levelKeys],
  );

  // In plan order: the preview's levels pair by index with the plan's HP and ability increases.
  const plannedLevels = useMemo(
    () =>
      adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => ({ klassId: k.id, level: k.nextLevel })),
    [adjustedClassPlan],
  );

  const previewQuery = useQuery({
    ...levelPreviewQuery(characterId, plannedLevels),
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

  const attributeData = useMemo(() => {
    if (!previewQuery.data) return undefined;
    if (abilityIncreaseLevels.length === 0) return { isAvailable: false as const, attributes: {} };

    // Adjust attributes client-side for user-selected ability increases
    // (preview is cached per class plan only, doesn't refire on ability changes).
    const baseAttrs = previewQuery.data.attributes.attributes;
    const increaseCounts: Record<string, number> = {};
    for (const abilityId of Object.values(abilityIncreases))
      if (abilityId) increaseCounts[abilityId] = (increaseCounts[abilityId] ?? 0) + 1;

    const adjusted = Object.fromEntries(
      Object.entries(baseAttrs).map(([key, attr]) => {
        const bonus = increaseCounts[attr.abilityId] ?? 0;
        if (bonus === 0) return [key, attr];
        const newTotal = attr.total + bonus;
        return [
          key,
          { ...attr, level: attr.level + bonus, total: newTotal, modifier: computeAbilityModifier(newTotal) },
        ];
      }),
    );

    return {
      isAvailable: true as const,
      attributes: adjusted,
    };
  }, [previewQuery.data, abilityIncreaseLevels, abilityIncreases]);

  const isLoadingAttributes = previewQuery.isLoading;
  const attributesError = previewQuery.error;

  // Skill data (from preview)
  const perLevelClassSkillIds = previewQuery.data?.perLevelClassSkillIds;

  // How much the plan's ability increases raise the INT modifier over the preview's, which is cached per class plan
  // only: D&D 3.5's INT increases grant skill points retroactively, for every level
  const modDelta = useMemo(() => {
    const intAttr = previewQuery.data?.attributes.attributes.intelligence;
    if (!intAttr) return 0;
    const intIncreases = Object.values(abilityIncreases).filter((id) => id === intAttr.abilityId).length;
    return computeAbilityModifier(intAttr.total + intIncreases) - intAttr.modifier;
  }, [previewQuery.data, abilityIncreases]);

  // Each planned level's points, recomputed from its points before the minimum with the raised modifier
  const perLevelSkillPoints = useMemo(() => {
    const data = previewQuery.data;
    if (!data) return undefined;
    if (modDelta === 0) return data.perLevelSkillPoints;
    const existingLevelCount = data.skills.totalCharacterLevel - data.perLevelSkillPointBases.length;
    return data.perLevelSkillPointBases.map((points, i) =>
      computeLevelSkillPoints(points + modDelta, data.skills.bonusPerLevel, existingLevelCount === 0 && i === 0),
    );
  }, [previewQuery.data, modDelta]);

  // The total ceiling follows every level's points the same way (existing and planned, the first ×4). Without this,
  // the skills step's "X / Y" cap stays at the pre-bump value and silently caps input below what the bump grants.
  const skillData = useMemo(() => {
    const base = previewQuery.data?.skills ?? null;
    if (!base) return null;
    if (modDelta === 0) return base;
    const gained = base.pointsPerLevel.reduce(
      (acc, points, i) =>
        acc +
        computeLevelSkillPoints(points + modDelta, base.bonusPerLevel, i === 0) -
        computeLevelSkillPoints(points, base.bonusPerLevel, i === 0),
      0,
    );
    return { ...base, skillPointsToSpend: Math.max(1, base.skillPointsToSpend + gained) };
  }, [previewQuery.data, modDelta]);

  const isLoadingSkills = previewQuery.isLoading;
  const skillsError = previewQuery.error;

  // Feat data (from preview)
  const featData = useMemo(() => previewQuery.data?.feats ?? null, [previewQuery.data]);

  const isLoadingFeats = previewQuery.isLoading;
  const featsError = previewQuery.error;

  // Power data (from preview)
  const powerData = useMemo(() => previewQuery.data?.powers ?? null, [previewQuery.data]);

  // The picks, fitted to the slots the plan gives
  const { feats: selectedFeats, pools: adjustedFeatPools } = useMemo(
    () => fitFeats(picked.feats, featData?.aptitudePools),
    [picked.feats, featData],
  );
  const selectedPowers = useMemo(() => fitPowers(picked.powers, powerData?.aptitudePools), [picked.powers, powerData]);
  // The planned levels' class skills and points, which the skills step and the review spend the points over
  const skillLevels = useMemo<SkillLevels | undefined>(
    () =>
      perLevelClassSkillIds &&
      perLevelSkillPoints && { classSkillIds: perLevelClassSkillIds, points: perLevelSkillPoints },
    [perLevelClassSkillIds, perLevelSkillPoints],
  );
  const skillPointAllocations = useMemo(
    () => fitSkillPoints(picked.skillPoints, skillData, skillLevels),
    [picked.skillPoints, skillData, skillLevels],
  );
  const selectedAptitude = openPoolOf(base.selectedAptitude, adjustedFeatPools);
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
  const featPicker = plannedPicker(
    previewLevelDetails,
    abilityIncreases,
    selectedAptitude
      ? nextPickLevel(
          previewQuery.data?.perLevelFeatSlots[selectedAptitude] ?? [],
          (selectedFeats[selectedAptitude] ?? []).length,
        )
      : 0,
    allSelectedFeatPickString,
  );

  // The level the next spell pick lands on, in the open pool at its open spell level
  const powerPicker = plannedPicker(
    previewLevelDetails,
    abilityIncreases,
    selectedPowerAptitude
      ? nextPickLevel(
          spellSlotsPerLevel(previewQuery.data?.perLevelPowerSlots[selectedPowerAptitude] ?? [], selectedPowerLevel),
          (selectedPowers[selectedPowerAptitude] ?? []).filter(
            (power) => selectedPowerLevel === null || power.powerLevel === selectedPowerLevel,
          ).length,
        )
      : 0,
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
        abilityId: abilityIncreases[i] ?? null,
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
    skillLevels,

    // Feats
    featData,
    isLoadingFeats,
    featsError,
    adjustedFeatPools,
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
