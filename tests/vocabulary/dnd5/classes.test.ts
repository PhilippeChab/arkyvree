import { describe, expect, test } from "bun:test";

import { readClassLevels } from "@/tests/support/dnd5/references.ts";
import { PROFICIENCY_BONUS_BY_LEVEL } from "@/vocabulary/dnd5/classes.ts";

/** The SRD's classes, by their reference's name. */
const CLASSES = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];

describe("The Character Advancement table", () => {
  test("gives every class the Proficiency Bonus its own table gives at each level", () => {
    for (const name of CLASSES)
      expect(readClassLevels(name).map((level) => level.prof_bonus)).toEqual([...PROFICIENCY_BONUS_BY_LEVEL]);
  });
});
