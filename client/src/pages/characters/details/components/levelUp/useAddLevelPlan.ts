import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import { useDebouncedValue } from "@/client/src/hooks/index.ts";

import { plannedLevel, plannedSlotKeys } from "./classPlan.ts";
import { levelPreviewQuery } from "./levelUpQueries.ts";
import { abilityIncreasesOf } from "./pendingPicks.ts";
import { pickIds, type SelectedKlass, useLevelWizardBase } from "./useLevelWizardBase.ts";
import { CLASS_PLAN_STEP, HP_STEP } from "./wizardSteps.ts";

interface AddLevelPlanParams {
  characterId: string;
  open: boolean;
}

/** Add Level's state before the ruleset answers it: its plan, and the preview it asks of it. */
export type AddLevelPlan = ReturnType<typeof useAddLevelPlan>;

/** Add Level's own steps before those the ruleset lists for a new level: its class plan, then its hit points. */
const OWN_STEPS = [CLASS_PLAN_STEP, HP_STEP] as const;

/**
 * Add Level's plan, every ruleset's alike, on `useLevelWizardBase`: the classes it adds a level in (`classPlan.ts`), the
 * class picker's search, each planned level's hit points and ability increase, kept by its slot's key, and the preview
 * it asks of the planned levels and of the picks so far, which the ruleset answers (`PreviewAnswers`, read by its hook
 * for `useAddLevelWizardBase`).
 */
export function useAddLevelPlan({ open, characterId }: AddLevelPlanParams) {
  const base = useLevelWizardBase({ characterId, open, ownSteps: OWN_STEPS });
  const { picked, activeStep, debouncedSkillPoints, resetPicks } = base;

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

  const resetPlan = useCallback(() => {
    resetPicks();
    setKlassSearch("");
    slotCounter.current = 0;
    setSlotKeys([]);
    setClassPlan([]);
    setHpBySlot({});
    setAbilityBySlot({});
  }, [resetPicks]);

  return {
    ...base,
    abilityBySlot,
    classPlan: adjustedClassPlan,
    debouncedKlassSearch,
    handleAbilityIncreaseChange,
    handleAddLevel,
    handleClassChange,
    handleHpChange,
    handleQuickAddLevel,
    handleRemoveLevel,
    // Cancel asks before it discards a plan
    hasProgress: activeStep > 0 || classPlan.some((k) => k !== null),
    hpValues,
    levelKeys,
    previewQuery,
    resetPlan,
    setKlassSearch,
    slotKeys,
    validClassPlan,
  };
}
