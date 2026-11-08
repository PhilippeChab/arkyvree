import { describe, expect, test } from "bun:test";

import { groupPartyColumns } from "@/client/src/pages/campaigns/details/sections/partyColumns.ts";

/** A character as the Characters tab lists it, by its name, partly seen or not. */
function character(name: string, isPartial = false) {
  return { name, isPartial };
}

/** The columns' characters by name. */
function namesOf(columns: { name: string }[][]) {
  return columns.map((column) => column.map(({ name }) => name));
}

describe("the Party View's columns", () => {
  test("give each whole character a column of its own, in their order", () => {
    expect(namesOf(groupPartyColumns([character("Ada"), character("Bo"), character("Cy")], true))).toEqual([
      ["Ada"],
      ["Bo"],
      ["Cy"],
    ]);
  });

  test("put the next character under a partly seen one, whatever it is", () => {
    const characters = [character("Ada", true), character("Bo"), character("Cy", true), character("Di", true)];
    expect(namesOf(groupPartyColumns(characters, true))).toEqual([
      ["Ada", "Bo"],
      ["Cy", "Di"],
    ]);
  });

  test("hold two characters at most, and none under a whole one", () => {
    const characters = [character("Ada", true), character("Bo", true), character("Cy", true), character("Di")];
    expect(namesOf(groupPartyColumns(characters, true))).toEqual([
      ["Ada", "Bo"],
      ["Cy", "Di"],
    ]);
    expect(namesOf(groupPartyColumns([character("Ada"), character("Bo", true), character("Cy")], true))).toEqual([
      ["Ada"],
      ["Bo", "Cy"],
    ]);
  });

  test("leave a partly seen character last alone in its column", () => {
    expect(namesOf(groupPartyColumns([character("Ada"), character("Bo", true)], true))).toEqual([["Ada"], ["Bo"]]);
    expect(groupPartyColumns([], true)).toEqual([]);
  });

  test("give each character a column of its own where a column can't show two", () => {
    const characters = [character("Ada", true), character("Bo"), character("Cy", true), character("Di", true)];
    expect(namesOf(groupPartyColumns(characters, false))).toEqual([["Ada"], ["Bo"], ["Cy"], ["Di"]]);
  });
});
