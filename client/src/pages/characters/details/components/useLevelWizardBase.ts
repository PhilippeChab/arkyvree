import { useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useState } from "react";

import { useValidationIssues } from "@/client/src/components/characters/index.ts";
import { useDebouncedValue, useFormWith, useToggleSet } from "@/client/src/hooks/index.ts";
import { invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

/** A saved level, as Edit Level loads it. */
type LevelData = InferResponseType<LevelsApi[":characterLevelId"]["$get"], 200>;

type LevelsApi = (typeof rpc.api.characters.levels)[":characterId"];

/** A class the class plan offers. */
export type AvailableKlass = InferResponseType<LevelsApi["available-classes"]["$get"], 200>["items"][number];

/** The picks a level wizard collects. */
export interface LevelUpFormData {
  selectedAttribute: string | null;
  selectedClass: SelectedKlass | null;
  selectedFeats: Record<string, SelectedFeat[]>;
  selectedHP: number | null;
  selectedPowers: Record<string, SelectedPower[]>;
  skillPointAllocations: Record<string, number>;
}

/** A feat picked for the level, as a saved level lists it. */
export type SelectedFeat = LevelData["feats"][string][number];

/** A class picked for a level. */
export type SelectedKlass = Pick<AvailableKlass, "id" | "name" | "nextLevel" | "maxLevel" | "hd" | "eligible">;

/** A spell picked for the level, as a saved level lists it. */
export type SelectedPower = LevelData["powers"][string][number];

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
 * What a base rules' Add Level and Edit Level wizards share: the picks form the level endpoints take, the step, the feat
 * and spell pickers' state, and the save's cache refresh and errors.
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
  const { issues, setIssues, handleSaveError } = useValidationIssues("Failed to finalize level up");

  const handleBack = useCallback(() => {
    setIssues([]);
    setActiveStep((prev) => prev - 1);
  }, [setIssues]);

  const resetPicks = useCallback(() => {
    setShowCancelConfirm(false);
    reset();
    setSelectedAptitude(null);
    setSelectedPowerAptitude(null);
    setSelectedPowerLevel(null);
    setFeatSearch("");
    collapseFeatFamilies();
    setPowerSearch("");
    setIssues([]);
    setActiveStep(0);
  }, [reset, setIssues, collapseFeatFamilies]);

  /** Drops the wizard's cached slots and refetches the sheet once the save lands. */
  const refreshAfterSave = useCallback(async () => {
    queryClient.removeQueries({ queryKey: QUERY_KEYS.characters.levelUp.all(characterId) });
    // Its cards show its levels
    void invalidateCharacterListings(queryClient);
    await invalidateCharacter(queryClient, characterId);
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
    issues,
    setIssues,
    handleBack,
    resetPicks,
    refreshAfterSave,
    handleSaveError,
  };
}
