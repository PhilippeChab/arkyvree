import { describe, expect, test } from "bun:test";

import SheetSummaries from "@/engine/rulesets/dnd3.5/characters/description/SheetSummaries.ts";

/** The words of a 3.5 character page's own level actions. */
const LEVEL_WORDS = {
  add: "Add Level",
  removeLast: "Remove Last Level",
  removeLastMessage: "Are you sure you want to remove the last level? This action cannot be undone.",
};

/** A class the character has `levels` of, each its level of the class, its character level's id `<class>-<level>`. */
function classOf(id: string, name: string, levels: number) {
  return {
    klass: { id, name },
    levels: Array.from({ length: levels }, (_, index) => ({
      characterLevel: { id: `${id}-${index + 1}` },
      klassLevel: { level: index + 1 },
    })),
  };
}

describe("A 3.5 sheet's summary", () => {
  test("is a track per class, each at its level, with its levels and their words, in the order it took them", () => {
    expect(
      SheetSummaries.describe({ fighter: classOf("fighter", "Fighter", 2), rogue: classOf("rogue", "Rogue", 1) }),
    ).toEqual({
      separator: " · ",
      tracks: [
        {
          id: "fighter",
          entityType: "klasses",
          name: "Fighter",
          label: "Fighter 2",
          words: { open: "Fighter 2 Levels", levels: "Fighter Levels", add: "Add Fighter Level" },
          advancements: [
            { id: "fighter-1", label: "Level 1", edit: "Edit Fighter Level 1" },
            { id: "fighter-2", label: "Level 2", edit: "Edit Fighter Level 2" },
          ],
        },
        {
          id: "rogue",
          entityType: "klasses",
          name: "Rogue",
          label: "Rogue 1",
          words: { open: "Rogue 1 Levels", levels: "Rogue Levels", add: "Add Rogue Level" },
          advancements: [{ id: "rogue-1", label: "Level 1", edit: "Edit Rogue Level 1" }],
        },
      ],
      words: LEVEL_WORDS,
    });
  });

  test("has no track for a character without classes, and its page's level words still", () => {
    expect(SheetSummaries.describe({})).toEqual({ separator: " · ", tracks: [], words: LEVEL_WORDS });
  });
});
