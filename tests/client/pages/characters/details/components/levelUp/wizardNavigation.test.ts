import { describe, expect, test } from "bun:test";

import { navigationOf, shownStep } from "@/client/src/pages/characters/details/components/levelUp/wizardNavigation.ts";
import {
  CLASS_PLAN_STEP,
  HP_STEP,
  REVIEW_STEP,
} from "@/client/src/pages/characters/details/components/levelUp/wizardSteps.ts";

/** Add Level's steps, its own around those a ruleset lists for a level */
const LISTED_STEPS = [
  CLASS_PLAN_STEP,
  HP_STEP,
  { name: "ability-increase", label: "Ability Increase" },
  { name: "feats", label: "Feats" },
  REVIEW_STEP,
];

/** Its own steps alone, as it lists them while the ruleset's steps load again */
const OWN_STEPS = [CLASS_PLAN_STEP, HP_STEP, REVIEW_STEP];

/** A wizard at a step, through its navigation: the steps it's moved to, and the saves it sent (forced or not) */
function wizardAt(activeStep: number, isLastStep = false) {
  const movedTo: number[] = [];
  const saves: boolean[] = [];
  const navigation = navigationOf({
    hasProgress: true,
    onClose: () => undefined,
    reset: () => undefined,
    save: (force) => saves.push(force),
    wizard: {
      activeStep,
      isLastStep,
      setActiveStep: (step) => movedTo.push(step),
      setIssues: () => undefined,
      setShowCancelConfirm: () => undefined,
    },
  });
  return { movedTo, navigation, saves };
}

describe("a level wizard's steps", () => {
  test("show the step it moved to while its steps list it", () => {
    expect(LISTED_STEPS[shownStep(LISTED_STEPS, 0)]).toBe(CLASS_PLAN_STEP);
    expect(LISTED_STEPS[shownStep(LISTED_STEPS, 3)].name).toBe("feats");
  });

  test("show the review when the save drops the steps the ruleset listed under the wizard at its last", () => {
    const shown = shownStep(OWN_STEPS, LISTED_STEPS.length - 1);
    expect(shown).toBe(2);
    expect(OWN_STEPS[shown]).toBe(REVIEW_STEP);
  });

  test("go Back and Next from the step shown", () => {
    const back = wizardAt(shownStep(OWN_STEPS, 4));
    back.navigation.handleBack();
    const next = wizardAt(1);
    next.navigation.handleNext();
    expect([back.movedTo, next.movedTo]).toEqual([[1], [2]]);
  });

  test("save on the last step's Next instead of moving on", () => {
    const { movedTo, navigation, saves } = wizardAt(2, true);
    navigation.handleNext();
    expect([movedTo, saves]).toEqual([[], [false]]);
  });
});
