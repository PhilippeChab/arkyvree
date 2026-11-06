import { describe, expect, test } from "bun:test";

import { readSpellLists } from "@/codegen/dnd5.2/tools/detect/spellLists.ts";

describe("The spell lists a feat offers", () => {
  test("are the classes its text names", () => {
    expect(
      readSpellLists("You learn two cantrips of your choice from the Cleric, Druid, or Wizard spell list."),
    ).toEqual(["Cleric", "Druid", "Wizard"]);
  });

  test("are none for a text that offers none", () => {
    expect(readSpellLists("You gain proficiency in any combination of three skills.")).toEqual([]);
  });
});
