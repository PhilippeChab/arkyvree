import { useMemo } from "react";

import { fitSkillPoints, keepFitted, openPoolOf, type SpentSkill } from "./fitPicks.ts";
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
 * What a ruleset answers of the picks so far, which a level wizard keeps them by (`fitPicks.ts`) and its Next waits for:
 * the feat pools' room, what of the feats and powers picked fits, what the skill points come to, and whether the step
 * shown is answered and done.
 */
export interface PickAnswers {
  /** Each feat pool's room for the feats picked: one with none left closes its picker */
  featPools: Record<string, { available: number }>;
  /** What of the feats picked fits their pools, each pool's ids: none while the answer is for earlier picks */
  fittedFeats: Record<string, string[]> | undefined;
  /** What of the powers picked fits their pools, each pool's ids: none while the answer is for earlier picks */
  fittedPowers: Record<string, string[]> | undefined;
  /** The skills the points are spent on, each with its ranks by points: none until they load */
  skills: SpentSkill[] | undefined;
  /**
   * Next waits: an answer it waits for loads, the step shown has none, or its answer says a pick is still to make there
   * (an ability increase), as the rules check the save
   */
  waiting: boolean;
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
  const skillPointAllocations = fitSkillPoints(picked.skillPoints, skills);
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
