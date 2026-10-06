import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useDebouncedValue, useToggleSet, useValidationIssues } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";

import type { AptitudePool, LevelUpFormData } from "./levelUpTypes.ts";

type LevelWizardBase = ReturnType<typeof useLevelWizardBase>;

const EMPTY_PICKS: LevelUpFormData = {
  selectedClass: null,
  selectedHP: null,
  selectedAttribute: null,
  selectedFeats: {},
  selectedPowers: {},
  skillPointAllocations: {},
};

/** Feat or spell picks as the aptitude → ids map the save endpoints take. */
export function pickIds(picks: Record<string, { id: string }[]>) {
  return Object.fromEntries(
    Object.entries(picks).map(([aptitudeId, items]) => [aptitudeId, items.map((item) => item.id)]),
  );
}

/**
 * The feat pools grown by the picked feats' "add" aptitude modifiers. When a
 * pool shrinks (a feat that granted slots was removed), the picks past it are
 * dropped, and the open picker closes once its pool has no room left.
 */
export function useAdjustedFeatPools(
  aptitudePools: Record<string, AptitudePool> | undefined,
  { selectedFeats, getValues, setValue, selectedAptitude, setSelectedAptitude }: LevelWizardBase,
) {
  const adjustedFeatPools = useMemo(() => {
    if (!aptitudePools) return {};
    const pools = { ...aptitudePools };

    const adjustments = new Map<string, number>();
    for (const feats of Object.values(selectedFeats)) {
      for (const feat of feats) {
        for (const mod of feat.aptitudeModifiers ?? []) {
          if (mod.operator === "add") {
            adjustments.set(mod.aptitudeId, (adjustments.get(mod.aptitudeId) ?? 0) + mod.value);
          }
        }
      }
    }

    for (const [aptitudeId, delta] of adjustments) {
      if (pools[aptitudeId]) {
        pools[aptitudeId] = {
          ...pools[aptitudeId],
          allowed: pools[aptitudeId].allowed + delta,
          available: pools[aptitudeId].available + delta,
        };
      }
    }

    return pools;
  }, [aptitudePools, selectedFeats]);

  useEffect(() => {
    let changed = false;
    const updated = { ...getValues("selectedFeats") };
    for (const [poolId, feats] of Object.entries(updated)) {
      const pool = adjustedFeatPools[poolId];
      const max = pool ? Math.max(0, pool.available) : 0;
      if (feats.length > max) {
        updated[poolId] = feats.slice(0, max);
        changed = true;
      }
    }
    if (changed) setValue("selectedFeats", updated);
    if (
      selectedAptitude &&
      adjustedFeatPools[selectedAptitude]?.available !== undefined &&
      adjustedFeatPools[selectedAptitude].available <= 0
    ) {
      setSelectedAptitude(null);
    }
  }, [adjustedFeatPools, getValues, setValue, selectedAptitude, setSelectedAptitude]);

  return adjustedFeatPools;
}

/**
 * What the Add Level and Edit Level wizards share: the picks form, the step,
 * the feat and spell pickers' state, and the save's cache refresh and errors.
 */
export function useLevelWizardBase(characterId: string) {
  const queryClient = useQueryClient();

  const { control, handleSubmit, getValues, setValue, reset, watch } = useForm<LevelUpFormData>({
    defaultValues: EMPTY_PICKS,
    mode: "onChange",
  });
  const selectedFeats = watch("selectedFeats");
  const selectedPowers = watch("selectedPowers");
  const skillPointAllocations = watch("skillPointAllocations");

  const [activeStep, setActiveStep] = useState(0);
  const [selectedAptitude, setSelectedAptitude] = useState<string | null>(null);
  const [selectedPowerAptitude, setSelectedPowerAptitude] = useState<string | null>(null);
  const [selectedPowerLevel, setSelectedPowerLevel] = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [featSearch, setFeatSearch] = useState("");
  const debouncedFeatSearch = useDebouncedValue(featSearch);
  const [expandedFeatFamilies, toggleFeatFamily, collapseFeatFamilies] = useToggleSet();
  const [powerSearch, setPowerSearch] = useState("");
  const debouncedPowerSearch = useDebouncedValue(powerSearch);
  const { validationErrors, setValidationErrors, handleSaveError } = useValidationIssues("Failed to finalize level up");

  // The picked feats as the "featId:aptitudeId" list the picker endpoints take.
  const allSelectedFeatPickString = useMemo(() => {
    const pairs = Object.entries(selectedFeats).flatMap(([aptitudeId, feats]) =>
      feats.map((f) => `${f.id}:${aptitudeId}`),
    );
    return pairs.length > 0 ? pairs.sort().join(",") : undefined;
  }, [selectedFeats]);

  const handleDeleteFeat = useCallback(
    (featId: string, aptitudeId: string) => {
      setValue("selectedFeats", {
        ...selectedFeats,
        [aptitudeId]: (selectedFeats[aptitudeId] || []).filter((f) => f.id !== featId),
      });
    },
    [selectedFeats, setValue],
  );

  const handleDeletePower = useCallback(
    (powerId: string, aptitudeId: string) => {
      setValue("selectedPowers", {
        ...selectedPowers,
        [aptitudeId]: (selectedPowers[aptitudeId] || []).filter((p) => p.id !== powerId),
      });
    },
    [selectedPowers, setValue],
  );

  const handleBack = useCallback(() => {
    setValidationErrors([]);
    setActiveStep((prev) => prev - 1);
  }, [setValidationErrors]);

  const resetPicks = useCallback(() => {
    setShowCancelConfirm(false);
    reset();
    setSelectedAptitude(null);
    setSelectedPowerAptitude(null);
    setSelectedPowerLevel(null);
    setFeatSearch("");
    collapseFeatFamilies();
    setPowerSearch("");
    setValidationErrors([]);
    setActiveStep(0);
  }, [reset, setValidationErrors, collapseFeatFamilies]);

  /** Drops the wizard's cached slots and refetches the sheet once the save lands. */
  const refreshAfterSave = useCallback(async () => {
    queryClient.removeQueries({ queryKey: queryKeys.characters.levelUp.all(characterId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(characterId) });
  }, [queryClient, characterId]);

  return {
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
    activeStep,
    setActiveStep,
    selectedAptitude,
    setSelectedAptitude,
    selectedPowerAptitude,
    setSelectedPowerAptitude,
    selectedPowerLevel,
    setSelectedPowerLevel,
    showCancelConfirm,
    setShowCancelConfirm,
    featSearch,
    setFeatSearch,
    debouncedFeatSearch,
    expandedFeatFamilies,
    toggleFeatFamily,
    powerSearch,
    setPowerSearch,
    debouncedPowerSearch,
    validationErrors,
    setValidationErrors,
    allSelectedFeatPickString,
    handleDeleteFeat,
    handleDeletePower,
    handleBack,
    resetPicks,
    refreshAfterSave,
    handleSaveError,
  };
}
