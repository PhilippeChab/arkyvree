import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useValidationIssues } from "@/client/src/components/characters/index.ts";
import { useDebouncedValue, useFormWith, useToggleSet } from "@/client/src/hooks/index.ts";
import { invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

import type { LevelUpFormData } from "./levelUpTypes.ts";

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
 * What the Add Level and Edit Level wizards share: the picks form, the step,
 * the feat and spell pickers' state, and the save's cache refresh and errors.
 */
export function useLevelWizardBase(characterId: string) {
  const queryClient = useQueryClient();

  const form = useFormWith<LevelUpFormData>(EMPTY_PICKS, { mode: "onChange" });
  const { control, handleSubmit, getValues, setValue, reset, watch } = form;
  // What was picked: each wizard reads it fitted to its slots (`fitPicks.ts`)
  const picked = {
    feats: watch("selectedFeats"),
    powers: watch("selectedPowers"),
    skillPoints: watch("skillPointAllocations"),
  };

  const [activeStep, setActiveStep] = useState(0);
  const [selectedAptitude, setSelectedAptitude] = useState<string | null>(null);
  const [selectedPowerAptitude, setSelectedPowerAptitude] = useState<string | null>(null);
  const [selectedPowerLevel, setSelectedPowerLevel] = useState<number | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [featSearch, setFeatSearch] = useState("");
  const debouncedFeatSearch = useDebouncedValue(featSearch);
  const { keys: expandedFeatFamilies, toggle: toggleFeatFamily, clear: collapseFeatFamilies } = useToggleSet();
  const [powerSearch, setPowerSearch] = useState("");
  const debouncedPowerSearch = useDebouncedValue(powerSearch);
  const { validationErrors, setValidationErrors, handleSaveError } = useValidationIssues("Failed to finalize level up");

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
    queryClient.removeQueries({ queryKey: QUERY_KEYS.characters.levelUp.all(characterId) });
    // Its cards show its levels
    void invalidateCharacterListings(queryClient);
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.detail(characterId) });
  }, [queryClient, characterId]);

  return {
    form,
    control,
    handleSubmit,
    getValues,
    setValue,
    watch,
    picked,
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
    handleBack,
    resetPicks,
    refreshAfterSave,
    handleSaveError,
  };
}
