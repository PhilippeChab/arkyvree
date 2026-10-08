import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo, useRef, useState } from "react";

import { computeAbilityModifier } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { computeLevelSkillPoints } from "@/shared/dnd3.5/skills.ts";

import { plannedLevel } from "./classPlan.ts";
import { fitFeats, fitPowers, fitSkillPoints, openPoolOf } from "./fitPicks.ts";
import { type HpLevel, hpSet } from "./hitPoints.ts";
import {
  availableFeatsGroupedQuery,
  availablePowersQuery,
  type ClassPicker,
  levelPreviewQuery,
  type PickerLevel,
} from "./levelUpQueries.ts";
import type { SelectedKlass } from "./levelUpTypes.ts";
import { featPickString, pendingLevelsOf, skillPointString } from "./pendingPicks.ts";
import type { SkillLevels } from "./skillLevels.ts";
import { pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";

interface UseAddLevelWizardParams {
  characterId: string;
  onClose: () => void;
  open: boolean;
}

/** The Add Level wizard's state: what its dialog and its steps read. */
export type AddLevelWizard = ReturnType<typeof useAddLevelWizard>;

export const ADD_STEP_CONTENT = ["class-plan", "hp", "attributes", "skills", "feats", "powers", "review"] as const;

export const ADD_STEP_LABELS = [
  "Class Plan",
  "Select HP",
  "Attribute Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

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
    setValidationErrors,
    resetPicks,
    refreshAfterSave,
    handleSaveError,
  } = base;

  const featsStep = ADD_STEP_CONTENT.indexOf("feats");
  const powersStep = ADD_STEP_CONTENT.indexOf("powers");

  const slotCounter = useRef(0);
  const [slotKeys, setSlotKeys] = useState<number[]>([]);
  const [classPlan, setClassPlan] = useState<(SelectedKlass | null)[]>([]);
  const [hpValues, setHpValues] = useState<(number | null)[]>([]);
  const [abilityIncreases, setAbilityIncreases] = useState<Record<number, string | null>>({});

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

  const handleRemoveLevel = useCallback(
    (index: number) => {
      // HP and ability increases are kept per filled level, not per slot.
      if (classPlan[index] !== null) {
        const levelIndex = classPlan.slice(0, index).filter((k) => k !== null).length;
        setHpValues((hp) => hp.filter((_, i) => i !== levelIndex));
        setAbilityIncreases((ai) => {
          const next: Record<number, string | null> = {};
          for (const [k, v] of Object.entries(ai)) {
            const idx = Number(k);
            if (idx < levelIndex) next[idx] = v;
            else if (idx > levelIndex) next[idx - 1] = v;
          }
          return next;
        });
      }
      setClassPlan((prev) => prev.filter((_, i) => i !== index));
      setSlotKeys((prev) => prev.filter((_, i) => i !== index));
    },
    [classPlan],
  );

  // Only non-null entries matter for downstream steps
  const validClassPlan = useMemo(() => classPlan.filter((k): k is SelectedKlass => k !== null), [classPlan]);

  // The HP list follows the valid (non-null) class plan's length: a level added gets no HP yet, one removed drops its
  if (hpValues.length !== validClassPlan.length) {
    setHpValues(
      hpValues.length < validClassPlan.length
        ? [...hpValues, ...Array(validClassPlan.length - hpValues.length).fill(null)]
        : hpValues.slice(0, validClassPlan.length),
    );
  }

  const handleHpChange = useCallback((index: number, value: number | null) => {
    setHpValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const hpLevels = useMemo<HpLevel[]>(
    () =>
      adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => ({ className: k.name, hd: k.hd, nextLevel: k.nextLevel })),
    [adjustedClassPlan],
  );

  const handleAbilityIncreaseChange = useCallback((index: number, abilityId: string) => {
    setAbilityIncreases((prev) => ({ ...prev, [index]: abilityId }));
  }, []);

  // Derived: valid class count and class plan key
  const validClassCount = useMemo(() => classPlan.filter((k) => k !== null).length, [classPlan]);

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
    enabled: open && validClassCount >= 1 && activeStep > 0,
    placeholderData: keepPreviousData,
  });

  // Attribute data (from preview)
  const abilityIncreaseLevels = useMemo(
    () => previewQuery.data?.attributes.abilityIncreaseLevels ?? [],
    [previewQuery.data],
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

  // Adjust skill points client-side when INT is increased (preview is cached per class plan only).
  // D&D 3.5: INT increases retroactively grant skill points for all levels.
  // Returns the modifier delta vs the preview's INT mod, plus context needed to
  // adjust both the per-level array and the wizard-wide skillPointsToSpend total.
  const intModAdjustment = useMemo(() => {
    const attrs = previewQuery.data?.attributes.attributes;
    const intAttr = attrs?.intelligence;
    if (!intAttr) return null;
    const intIncreases = Object.values(abilityIncreases).filter((id) => id === intAttr.abilityId).length;
    if (intIncreases === 0) return null;
    const newIntMod = computeAbilityModifier(intAttr.total + intIncreases);
    const modDelta = newIntMod - intAttr.modifier;
    if (modDelta === 0) return null;
    return { modDelta };
  }, [previewQuery.data, abilityIncreases]);

  // Each planned level's points, recomputed from its points before the minimum with the raised modifier
  const perLevelSkillPoints = useMemo(() => {
    const data = previewQuery.data;
    if (!data) return undefined;
    if (!intModAdjustment) return data.perLevelSkillPoints;
    const { modDelta } = intModAdjustment;
    const existingLevelCount = data.skills.totalCharacterLevel - data.perLevelSkillPointBases.length;
    return data.perLevelSkillPointBases.map((points, i) =>
      computeLevelSkillPoints(points + modDelta, data.skills.bonusPerLevel, existingLevelCount === 0 && i === 0),
    );
  }, [previewQuery.data, intModAdjustment]);

  // The total ceiling follows every level's points the same way (existing and planned, the first ×4). Without this,
  // the skills step's "X / Y" cap stays at the pre-bump value and silently caps input below what the bump grants.
  const skillData = useMemo(() => {
    const base = previewQuery.data?.skills ?? null;
    if (!base) return null;
    if (!intModAdjustment) return base;
    const { modDelta } = intModAdjustment;
    const gained = base.pointsPerLevel.reduce(
      (acc, points, i) =>
        acc +
        computeLevelSkillPoints(points + modDelta, base.bonusPerLevel, i === 0) -
        computeLevelSkillPoints(points, base.bonusPerLevel, i === 0),
      0,
    );
    return { ...base, skillPointsToSpend: Math.max(1, base.skillPointsToSpend + gained) };
  }, [previewQuery.data, intModAdjustment]);

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
  const pendingLevels = pendingLevelsOf(previewLevelDetails, abilityIncreases);

  // The class picker's: every planned level, and what's picked over them so far
  const classPicker: ClassPicker = {
    ...pendingLevels,
    pendingFeatPicks: allSelectedFeatPickString,
    pendingSkillAllocations: skillPointString(skillPointAllocations),
  };

  // Current slot level context (for feat/power queries)
  const firstClass = useMemo(
    () => adjustedClassPlan.find((k): k is SelectedKlass => k !== null) ?? null,
    [adjustedClassPlan],
  );

  const lastLevel = useMemo(() => {
    const validClasses = adjustedClassPlan.filter((k): k is SelectedKlass => k !== null);
    return validClasses.length > 0 ? validClasses[validClasses.length - 1].nextLevel : 1;
  }, [adjustedClassPlan]);

  // For feat queries: determine which level in the plan the next pick lands
  // on so prerequisites are evaluated at the correct character state.
  const currentFeatSlotLevelIndex = useMemo(() => {
    const preview = previewQuery.data;
    if (!preview || !selectedAptitude) return 0;
    const slots = preview.perLevelFeatSlots[selectedAptitude] ?? [];
    const selectedCount = (selectedFeats[selectedAptitude] ?? []).length;
    let counted = 0;
    for (let i = 0; i < slots.length; i++) {
      counted += slots[i];
      if (counted > selectedCount) return i;
    }
    return Math.max(0, slots.length - 1);
  }, [previewQuery.data, selectedAptitude, selectedFeats]);

  // Use the slot-level context: query available feats at the specific level
  // where the next pick will land, not the final planned level.
  const slotLevelDetail = previewLevelDetails?.[currentFeatSlotLevelIndex];

  // The level the next feat pick lands on, and what it's checked against: the feat list's, and a family's variants'
  const featPicker: PickerLevel = {
    classId: slotLevelDetail?.klassId ?? firstClass?.id,
    level: slotLevelDetail?.level,
    selectedFeatPicks: allSelectedFeatPickString,
    ...pendingLevelsOf(previewLevelDetails, abilityIncreases, currentFeatSlotLevelIndex + 1),
    // None of the picks is saved yet: they're all pending
    pendingFeatPicks: allSelectedFeatPickString,
  };

  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    error: availableFeatsError,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    ...availableFeatsGroupedQuery(characterId, selectedAptitude, debouncedFeatSearch, featPicker),
    enabled: open && activeStep === featsStep,
  });

  const {
    items: availablePowers,
    isLoading: isLoadingAvailablePowers,
    error: availablePowersError,
    onScroll: handlePowersScroll,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useListboxQuery({
    ...availablePowersQuery(characterId, selectedPowerAptitude, selectedPowerLevel, debouncedPowerSearch, {
      classId: firstClass?.id,
      level: lastLevel,
      selectedFeatPicks: allSelectedFeatPickString,
      ...pendingLevels,
      // None of the picks is saved yet: they're all pending
      pendingFeatPicks: allSelectedFeatPickString,
    }),
    enabled: open && activeStep === powersStep,
  });

  const resetWizard = useCallback(() => {
    resetPicks();
    slotCounter.current = 0;
    setSlotKeys([]);
    setClassPlan([]);
    setHpValues([]);
    setAbilityIncreases({});
  }, [resetPicks]);

  // Pool-level picks; the backend distributes them to the levels.
  const finalizeMutation = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      // The plan's levels as its preview lists them, which must have loaded, each with its HP set
      const preview = previewQuery.data;
      if (!preview) throw new Error("The plan hasn't finished loading");
      const levels = preview.levelDetails.map((detail, i) => {
        const hp = hpValues[i];
        if (!hp) throw new Error("HP not selected");
        return { klassId: detail.klassId, level: detail.level, hp, abilityId: abilityIncreases[i] ?? null };
      });
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
      snackbar.success(`Added ${formatCount(validClassCount, "level")}`);
      resetWizard();
      onClose();
    },
    onError: handleSaveError,
  });

  const isLastStep = activeStep === ADD_STEP_CONTENT.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) finalizeMutation.mutate({ force: false });
    else setActiveStep((prev) => prev + 1);
  }, [isLastStep, finalizeMutation, setActiveStep]);

  const handleForceSubmit = useCallback(() => {
    setValidationErrors([]);
    finalizeMutation.mutate({ force: true });
  }, [finalizeMutation, setValidationErrors]);

  const hasProgress = activeStep > 0 || classPlan.some((k) => k !== null);

  const handleCancel = useCallback(() => {
    if (hasProgress) setShowCancelConfirm(true);
    else onClose();
  }, [hasProgress, onClose, setShowCancelConfirm]);

  const handleConfirmCancel = useCallback(() => {
    resetWizard();
    onClose();
  }, [resetWizard, onClose]);

  // The dialog also disables it while the save runs.
  const isNextDisabled = useMemo(() => {
    const content = ADD_STEP_CONTENT[activeStep];
    switch (content) {
      case "class-plan":
        return validClassCount < 1;
      case "hp":
        return !hpSet(hpLevels, hpValues);
      default:
        return false;
    }
  }, [activeStep, validClassCount, hpLevels, hpValues]);

  return {
    ...base,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
    selectedAptitude,
    isLastStep,

    // Class plan (step 1)
    classPlan: adjustedClassPlan,
    slotKeys,
    handleClassChange,
    handleAddLevel,
    handleQuickAddLevel,
    handleRemoveLevel,
    classPicker,

    // HP (step 2)
    hpValues,
    handleHpChange,
    hpLevels,

    // Attributes (step 3)
    attributeData,
    isLoadingAttributes,
    attributesError,
    abilityIncreaseLevels,
    abilityIncreases,
    handleAbilityIncreaseChange,

    // Skills (step 4)
    skillData,
    isLoadingSkills,
    skillsError,
    skillLevels,

    // Feats (step 5)
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

    // Powers (step 6)
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

    preview: previewQuery.data,
    isLoadingPreview: previewQuery.isLoading,
    levelDetails: previewQuery.data?.levelDetails ?? [],
  };
}
