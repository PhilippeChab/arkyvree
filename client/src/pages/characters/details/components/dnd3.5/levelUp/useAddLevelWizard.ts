import { keepPreviousData, skipToken, useMutation, useQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { useCallback, useMemo, useRef, useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useListboxQuery } from "@/client/src/hooks/index.ts";
import { rollDie } from "@/client/src/lib/dice.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { getLevelUpSections } from "@/client/src/pages/characters/details/components/dnd3.5/levelUpFactory.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { computeAbilityModifier } from "@/shared/dnd3.5/abilities.ts";
import { computeLevelSkillPoints } from "@/shared/dnd3.5/skills.ts";

import { featPickString, fitFeats, fitPowers, fitSkillPoints, openPoolOf } from "./fitPicks.ts";
import type { BaseRules, SelectedKlass } from "./levelUpTypes.ts";
import { pickIds, useLevelWizardBase } from "./useLevelWizardBase.ts";

type FinalizeJson = InferRequestType<(typeof rpc.api.characters.levels)[":characterId"]["finalize"]["$post"]>["json"];

interface UseAddLevelWizardParams {
  open: boolean;
  onClose: () => void;
  characterId: string;
  baseRules: BaseRules;
}

export const addStepContent = ["class-plan", "hp", "attributes", "skills", "feats", "powers", "review"] as const;

export const addStepLabels = [
  "Class Plan",
  "Select HP",
  "Attribute Increase",
  "Select Skills",
  "Select Feats",
  "Select Spells",
  "Review Changes",
];

export function useAddLevelWizard({ open, onClose, characterId, baseRules }: UseAddLevelWizardParams) {
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
  const levelUpSections = getLevelUpSections(baseRules);

  const featsStep = addStepContent.indexOf("feats");
  const powersStep = addStepContent.indexOf("powers");

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

  // Derive adjusted nextLevel values — each duplicate class increments from the server's base
  const adjustedClassPlan = useMemo(() => {
    const counters = new Map<string, number>();
    return classPlan.map((k) => {
      if (!k) return k;
      const count = counters.get(k.id) ?? 0;
      counters.set(k.id, count + 1);
      return { ...k, nextLevel: k.nextLevel + count };
    });
  }, [classPlan]);

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

  const handleHpRoll = useCallback(
    (index: number) => {
      const klass = validClassPlan[index];
      if (!klass) return;
      const result = rollDie(klass.hd);
      setHpValues((prev) => {
        const next = [...prev];
        next[index] = result;
        return next;
      });
    },
    [validClassPlan],
  );

  const handleHpRollAll = useCallback(() => {
    setHpValues(validClassPlan.map((klass) => rollDie(klass.hd)));
  }, [validClassPlan]);

  const handleHpMaxAll = useCallback(() => {
    setHpValues(validClassPlan.map((klass) => klass.hd));
  }, [validClassPlan]);

  const hpLevels = useMemo(
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
  const classPlanKey = useMemo(
    () =>
      adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => `${k.id}:${k.nextLevel}`)
        .join("|"),
    [adjustedClassPlan],
  );

  const previewQuery = useQuery({
    queryKey: queryKeys.characters.levelUp.preview(characterId, classPlanKey),
    queryFn: async () => {
      const levels = adjustedClassPlan
        .filter((k): k is SelectedKlass => k !== null)
        .map((k) => ({ klassId: k.id, level: k.nextLevel }));

      // Ability increases are applied client-side (see attributeData /
      // perLevelSkillPoints memos). Sending nulls keeps the server response
      // deterministic per classPlanKey — otherwise, a refetch triggered by a
      // classPlanKey change would read current abilityIncreases via closure,
      // server would apply the bump, and the client memo would double-count.
      const abilityIds = levels.map(() => null);

      return parseResponse(
        rpc.api.characters.levels[":characterId"]["preview"]["$post"]({
          param: { characterId },
          json: { levels, abilityIds },
        }),
      );
    },
    enabled: open && validClassCount >= 1 && activeStep > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  // Attribute data (from preview)
  const abilityIncreaseLevels = useMemo(
    () => previewQuery.data?.attributes.abilityIncreaseLevels ?? [],
    [previewQuery.data],
  );

  const attributeData = useMemo(() => {
    if (!previewQuery.data) return undefined;
    if (abilityIncreaseLevels.length === 0) {
      return { isAvailable: false as const, attributes: {} };
    }

    // Adjust attributes client-side for user-selected ability increases
    // (preview is cached per class plan only, doesn't refire on ability changes).
    const baseAttrs = previewQuery.data.attributes.attributes;
    const increaseCounts: Record<string, number> = {};
    for (const abilityId of Object.values(abilityIncreases)) {
      if (abilityId) increaseCounts[abilityId] = (increaseCounts[abilityId] ?? 0) + 1;
    }

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
    const intAttr = attrs?.["intelligence"];
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
  const skillPointAllocations = useMemo(
    () => fitSkillPoints(picked.skillPoints, skillData, perLevelClassSkillIds, perLevelSkillPoints),
    [picked.skillPoints, skillData, perLevelClassSkillIds, perLevelSkillPoints],
  );
  const selectedAptitude = openPoolOf(base.selectedAptitude, adjustedFeatPools);
  const allSelectedFeatPickString = useMemo(() => featPickString(selectedFeats), [selectedFeats]);

  const isLoadingPowers = previewQuery.isLoading;
  const powersError = previewQuery.error;

  // Pending level context for feat/power queries
  const previewLevelDetails = previewQuery.data?.levelDetails;
  const allKlassLevelIds = useMemo(() => {
    if (!previewLevelDetails) return undefined;
    const ids = previewLevelDetails.map((d) => d.klassLevelId);
    return ids.length > 0 ? ids.join(",") : undefined;
  }, [previewLevelDetails]);

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
  const slotLevelDetail = previewQuery.data?.levelDetails[currentFeatSlotLevelIndex];
  const pendingKlassLevelIdsUpToSlot = useMemo(() => {
    const details = previewQuery.data?.levelDetails;
    if (!details) return undefined;
    const ids = details.slice(0, currentFeatSlotLevelIndex + 1).map((d) => d.klassLevelId);
    return ids.length > 0 ? ids.join(",") : undefined;
  }, [previewQuery.data?.levelDetails, currentFeatSlotLevelIndex]);

  const pendingAbilityIdsUpToSlot = useMemo(() => {
    const details = previewQuery.data?.levelDetails;
    if (!details) return undefined;
    const ids = details.slice(0, currentFeatSlotLevelIndex + 1).map((_, i) => abilityIncreases[i] ?? "null");
    return ids.join(",");
  }, [previewQuery.data?.levelDetails, currentFeatSlotLevelIndex, abilityIncreases]);

  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    queryKey: queryKeys.characters.levelUp.availableFeatsGrouped(
      characterId,
      selectedAptitude,
      slotLevelDetail?.klassId ?? firstClass?.id,
      debouncedFeatSearch,
      undefined, // no editingLevelId
      allSelectedFeatPickString,
      pendingKlassLevelIdsUpToSlot,
      allSelectedFeatPickString,
    ),
    queryFn:
      open && activeStep === featsStep && selectedAptitude && slotLevelDetail
        ? ({ pageParam }) =>
            parseResponse(
              rpc.api.characters.levels[":characterId"]["available-feats"]["grouped"]["$get"]({
                param: { characterId },
                query: {
                  aptitudeId: selectedAptitude,
                  classId: slotLevelDetail.klassId,
                  level: slotLevelDetail.level.toString(),
                  limit: "20",
                  page: pageParam.toString(),
                  search: debouncedFeatSearch || undefined,
                  selectedFeatPicks: allSelectedFeatPickString || undefined,
                  pendingLevelClassLevelIds: pendingKlassLevelIdsUpToSlot || undefined,
                  pendingLevelAbilityIds: pendingAbilityIdsUpToSlot || undefined,
                  pendingLevelFeatPicks: allSelectedFeatPickString || undefined,
                },
              }),
            )
        : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
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
      firstClass?.id,
      debouncedPowerSearch,
      undefined, // no editingLevelId
      allSelectedFeatPickString,
      allKlassLevelIds,
      // All feat picks are "pending" (none are persisted yet),
      // so selectedFeatPicks and pendingLevelFeatPicks are the same set.
      allSelectedFeatPickString,
    ),
    queryFn:
      open && activeStep === powersStep && selectedPowerAptitude && firstClass
        ? ({ pageParam }) =>
            parseResponse(
              rpc.api.characters.levels[":characterId"]["available-powers"]["$get"]({
                param: { characterId },
                query: {
                  aptitudeId: selectedPowerAptitude,
                  classId: firstClass.id,
                  level: lastLevel.toString(),
                  powerLevel: selectedPowerLevel?.toString(),
                  limit: "20",
                  page: pageParam.toString(),
                  search: debouncedPowerSearch || undefined,
                  selectedFeatPicks: allSelectedFeatPickString || undefined,
                  pendingLevelClassLevelIds: allKlassLevelIds || undefined,
                  pendingLevelFeatPicks: allSelectedFeatPickString || undefined,
                },
              }),
            )
        : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const resetWizard = useCallback(() => {
    resetPicks();
    slotCounter.current = 0;
    setSlotKeys([]);
    setClassPlan([]);
    setHpValues([]);
    setAbilityIncreases({});
  }, [resetPicks]);

  const finalizeMutation = useMutation({
    mutationFn: (json: FinalizeJson) =>
      parseResponse(rpc.api.characters.levels[":characterId"].finalize.$post({ param: { characterId }, json })),
    onSuccess: async () => {
      await refreshAfterSave();
      snackbar.success(`Added ${formatCount(validClassCount, "level")}`);
      resetWizard();
      onClose();
    },
    onError: handleSaveError,
  });

  const isLastStep = activeStep === addStepContent.length - 1;

  // Pool-level picks; the backend distributes them to the levels.
  const finalize = useCallback(
    (force: boolean) => {
      const preview = previewQuery.data;
      if (!preview) return;

      finalizeMutation.mutate({
        levels: preview.levelDetails.map((d, i) => ({
          klassId: d.klassId,
          level: d.level,
          hp: hpValues[i] ?? 1,
          abilityId: abilityIncreases[i] ?? null,
        })),
        skills: skillPointAllocations,
        feats: pickIds(selectedFeats),
        powers: pickIds(selectedPowers),
        force,
      });
    },
    [
      previewQuery.data,
      hpValues,
      abilityIncreases,
      skillPointAllocations,
      selectedFeats,
      selectedPowers,
      finalizeMutation,
    ],
  );

  const handleNext = useCallback(() => {
    if (isLastStep) {
      finalize(false);
    } else {
      setActiveStep((prev) => prev + 1);
    }
  }, [isLastStep, finalize, setActiveStep]);

  const handleForceSubmit = useCallback(() => {
    setValidationErrors([]);
    finalize(true);
  }, [finalize, setValidationErrors]);

  const hasProgress = activeStep > 0 || classPlan.some((k) => k !== null);

  const handleCancel = useCallback(() => {
    if (hasProgress) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }, [hasProgress, onClose, setShowCancelConfirm]);

  const handleConfirmCancel = useCallback(() => {
    resetWizard();
    onClose();
  }, [resetWizard, onClose]);

  // The dialog also disables it while the save runs.
  const isNextDisabled = useMemo(() => {
    const content = addStepContent[activeStep];
    switch (content) {
      case "class-plan":
        return validClassCount < 1;
      case "hp":
        return hpValues.some((v) => v === null);
      default:
        return false;
    }
  }, [activeStep, validClassCount, hpValues]);

  return {
    ...base,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
    selectedAptitude,
    allSelectedFeatPickString,
    isLastStep,

    // Class plan (step 1)
    classPlan: adjustedClassPlan,
    slotKeys,
    handleClassChange,
    handleAddLevel,
    handleQuickAddLevel,
    handleRemoveLevel,

    // HP (step 2)
    hpValues,
    handleHpChange,
    handleHpRoll,
    handleHpRollAll,
    handleHpMaxAll,
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
    perLevelClassSkillIds,
    perLevelSkillPoints,

    // Feats (step 5)
    featData,
    isLoadingFeats,
    featsError,
    adjustedFeatPools,
    groupedFeats,
    isLoadingAvailableFeats,
    isFetchingNextFeatsPage,
    allKlassLevelIds,
    firstClass,
    lastLevel,
    handleFeatsScroll,

    // Powers (step 6)
    powerData,
    isLoadingPowers,
    powersError,
    availablePowers,
    isLoadingAvailablePowers,
    isFetchingNextPowersPage,
    handlePowersScroll,

    handleNext,
    handleCancel,
    handleConfirmCancel,
    handleForceSubmit,
    isNextDisabled,

    finalizeMutation,

    levelUpSections,

    preview: previewQuery.data,
    isLoadingPreview: previewQuery.isLoading,
    levelDetails: previewQuery.data?.levelDetails ?? [],
  };
}
