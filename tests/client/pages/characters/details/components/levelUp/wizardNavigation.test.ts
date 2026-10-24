import { describe, expect, test } from "bun:test";

import { navigationOf, shownStep } from "@/client/src/pages/characters/details/components/levelUp/wizardNavigation.ts";
import { REVIEW_STEP } from "@/client/src/pages/characters/details/components/levelUp/wizardSteps.ts";

/** A plan step, as a ruleset lists it first */
const PLAN_STEP = { name: "class-plan", label: "Class Plan" };

/** Add Level's steps: those a ruleset lists for a level, then its own review */
const LISTED_STEPS = [
  PLAN_STEP,
  { name: "vigor", label: "Select Vigor" },
  { name: "stat-increase", label: "Stat Increase" },
  { name: "perks", label: "Perks" },
  REVIEW_STEP,
];

/** Fewer steps, as it lists them once the save drops some under it */
const OWN_STEPS = [PLAN_STEP, { name: "vigor", label: "Select Vigor" }, REVIEW_STEP];

/** A wizard at a step, through its navigation: the steps it's moved to, and the saves it sent (forced or not) */
function wizardAt(activeStep: number, isLastStep = false) {
  const movedTo: number[] = [];
  const sentSaves: boolean[] = [];
  const navigation = navigationOf({
    hasProgress: true,
    onClose: () => undefined,
    save: (force) => sentSaves.push(force),
    wizard: {
      activeStep,
      isLastStep,
      setActiveStep: (step) => movedTo.push(step),
      setIssues: () => undefined,
      setShowCancelConfirm: () => undefined,
    },
  });
  return { movedTo, navigation, sentSaves };
}

describe("a level wizard's steps", () => {
  test("show the step it moved to while its steps list it", () => {
    expect(LISTED_STEPS[shownStep(LISTED_STEPS, 0)]).toBe(PLAN_STEP);
    expect(LISTED_STEPS[shownStep(LISTED_STEPS, 3)].name).toBe("perks");
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
    const { movedTo, navigation, sentSaves } = wizardAt(2, true);
    navigation.handleNext();
    expect([movedTo, sentSaves]).toEqual([[], [false]]);
  });
});
