import { expect, test } from "bun:test";

import type { LevelRows } from "@/engine/rulesets/dnd3.5/levelUp/plans.ts";
import type { SavedPickRows } from "@/engine/rulesets/dnd3.5/levelUp/SavedPicks.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";

/**
 * The picks 3.5's level flows read and write by name, each of its saved picks' (`SavedPickRows`) and of a level's rows
 * (`LevelRows`): the compiler refuses a pick either shape lacks or adds.
 */
const PICKS = { abilityIncreases: true, feats: true, powers: true, skills: true } satisfies Record<
  keyof LevelRows,
  true
> &
  Record<keyof SavedPickRows, true>;

test("a character's saved picks and a level's rows, as 3.5 reads and writes them, are the picks its storage declares", () => {
  expect(Object.keys(DND35_STORAGE.character.picks).toSorted()).toEqual(Object.keys(PICKS).toSorted());
});
