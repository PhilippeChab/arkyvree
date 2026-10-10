import { useMemo } from "react";

import type { PickAnswers } from "@/client/src/pages/characters/details/components/levelUpFactory.ts";

import { fitSkillPoints, keepFitted, openPoolOf } from "./fitPicks.ts";
import { pickerPairString } from "./pendingPicks.ts";
import type { LevelUpFormData } from "./useLevelWizardBase.ts";

/** What a level wizard's picks are fitted from: what was picked, and the feat pool its picker opened. */
interface PickedSoFar {
  picked: {
    feats: LevelUpFormData["selectedFeats"];
    powers: LevelUpFormData["selectedPowers"];
    skillPoints: LevelUpFormData["skillPointAllocations"];
  };
  selectedAptitude: string | null;
}

/**
 * A level wizard's picks as the ruleset's answers fit them (`fitPicks.ts`), what its steps show and its save takes: the
 * feats and powers each pool has room for, the skill points each skill keeps, the feat pool open while it has room, and
 * the feats and powers as its pickers check their options against them (`featPicks`, `powerPicks`).
 */
export function useFittedPicks({ picked, selectedAptitude }: PickedSoFar, answers: PickAnswers) {
  const { featPools, fittedFeats, fittedPowers, skills } = answers;
  const selectedFeats = useMemo(() => keepFitted(picked.feats, fittedFeats), [picked.feats, fittedFeats]);
  const selectedPowers = useMemo(() => keepFitted(picked.powers, fittedPowers), [picked.powers, fittedPowers]);
  const skillPointAllocations = useMemo(() => fitSkillPoints(picked.skillPoints, skills), [picked.skillPoints, skills]);
  const featPicks = useMemo(() => pickerPairString(selectedFeats), [selectedFeats]);
  const powerPicks = useMemo(() => pickerPairString(selectedPowers), [selectedPowers]);
  return {
    featPicks,
    powerPicks,
    selectedAptitude: openPoolOf(selectedAptitude, featPools),
    selectedFeats,
    selectedPowers,
    skillPointAllocations,
  };
}
