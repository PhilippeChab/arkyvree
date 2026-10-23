import { expect, test } from "bun:test";

import type { LevelRows } from "@/engine/rulesets/dnd3.5/levelUp/plans.ts";
import type { SavedPickRows } from "@/engine/rulesets/dnd3.5/levelUp/SavedPicks.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";

/** The picks 3.5's flows read of a character's saved levels: the compiler refuses a pick the shape lacks or adds. */
const SAVED = { abilityIncreases: true, feats: true, powers: true, skills: true } satisfies Record<
  keyof SavedPickRows,
  true
>;

/** The picks 3.5's flows write of a level: the compiler refuses a pick the shape lacks or adds. */
const WRITTEN = { abilityIncreases: true, feats: true, powers: true, skills: true } satisfies Record<
  keyof LevelRows,
  true
>;

test("the picks 3.5 reads of a character's levels and writes of a level are the picks its storage declares", () => {
  const declared = Object.keys(DND35_STORAGE.character.picks).toSorted();
  expect(Object.keys(SAVED).toSorted()).toEqual(declared);
  expect(Object.keys(WRITTEN).toSorted()).toEqual(declared);
});
