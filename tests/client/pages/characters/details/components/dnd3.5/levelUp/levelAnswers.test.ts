import { describe, expect, test } from "bun:test";

import {
  type AttributesData,
  previewAnswers,
  stepAnswers,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/levelAnswers.ts";
import type { LevelPreview } from "@/client/src/pages/characters/details/components/levelUp/index.ts";

/** A step's query that has answered nothing yet, nor is loading. */
const UNANSWERED = { data: undefined, isLoading: false, isPlaceholderData: false };

/** Edit Level's abilities step as it answers an increase level: picked, or not yet. */
function abilitiesStep(picked: boolean, isPlaceholderData = false) {
  const data: AttributesData = { isAvailable: true, attributes: {}, picked };
  return { data, isLoading: false, isPlaceholderData };
}

/** A plan's preview whose fourth level takes an ability increase, picked or not: what the answers read of it. */
function previewOf(picked: boolean) {
  return {
    attributes: { abilityIncreaseLevels: [3], attributes: {}, picked },
    feats: { aptitudePools: {}, fitted: {} },
    powers: { fitted: {} },
    skills: { skills: [] },
  } as unknown as LevelPreview;
}

describe("Add Level's Next on the Ability Increase step", () => {
  test("waits until the preview of the plan's increases says they're picked", () => {
    expect(previewAnswers(previewOf(false), false, "abilities").waiting).toBe(true);
    expect(previewAnswers(previewOf(true), false, "abilities").waiting).toBe(false);
  });

  test("waits while the preview answers for earlier picks, or hasn't answered yet", () => {
    expect(previewAnswers(previewOf(true), true, "abilities").waiting).toBe(true);
    expect(previewAnswers(undefined, false, "abilities").waiting).toBe(true);
  });

  test("leaves the other steps to their own checks", () => {
    expect(previewAnswers(previewOf(false), false, "feats").waiting).toBe(false);
  });
});

describe("Edit Level's Next on the Ability Increase step", () => {
  const steps = { feats: UNANSWERED, powers: UNANSWERED, skills: UNANSWERED };

  test("waits until the step's answer for the increase picked says it's picked", () => {
    expect(stepAnswers({ ...steps, abilities: abilitiesStep(false) }, "abilities").waiting).toBe(true);
    expect(stepAnswers({ ...steps, abilities: abilitiesStep(true) }, "abilities").waiting).toBe(false);
  });

  test("waits while the step answers for an earlier pick, or hasn't answered yet", () => {
    expect(stepAnswers({ ...steps, abilities: abilitiesStep(true, true) }, "abilities").waiting).toBe(true);
    expect(stepAnswers({ ...steps, abilities: UNANSWERED }, "abilities").waiting).toBe(true);
  });
});
