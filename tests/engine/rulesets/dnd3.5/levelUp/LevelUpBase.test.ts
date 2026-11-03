import { expect, test } from "bun:test";

import type { SavedLevelPicks } from "@/engine/rulesets/dnd3.5/levelUp/LevelUpBase.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";

/** The steps 3.5's flows read a saved level's picks by: the compiler refuses a step the shape lacks or adds. */
const SAVED = { abilities: true, feats: true, hp: true, skills: true, spells: true } satisfies Record<
  keyof SavedLevelPicks,
  true
>;

test("the steps 3.5 reads a saved level's picks by are the steps its storage declares", () => {
  const declared = DND35_STORAGE.registries.steps.map(({ step }) => step).toSorted();
  expect(Object.keys(SAVED).toSorted()).toEqual(declared);
});
