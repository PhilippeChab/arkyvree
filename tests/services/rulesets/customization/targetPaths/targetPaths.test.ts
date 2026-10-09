import { describe, expect, test } from "bun:test";

import { pickTargetLabels } from "@/server/services/rulesets/customization/targetPaths/targetPaths.ts";

describe("A target's labels", () => {
  const labels = {
    abilities: "Abilities",
    charisma: "Charisma",
    modifier: "Modifier",
    classes: "Classes",
    ranger: "Ranger",
  };

  test("are those of its path's segments that have one", () => {
    expect(pickTargetLabels(["abilities.charisma.unknown"], labels)).toEqual({
      abilities: "Abilities",
      charisma: "Charisma",
    });
  });

  test("are those of a template's path, bare or bracketed, and of every path of an expression", () => {
    const charisma = { abilities: "Abilities", charisma: "Charisma", modifier: "Modifier" };
    expect(pickTargetLabels(["{{ abilities.charisma.modifier }}"], labels)).toEqual(charisma);
    expect(pickTargetLabels(["{{ [abilities.charisma.modifier] }}"], labels)).toEqual(charisma);
    expect(
      pickTargetLabels(["{{ floor([classes.ranger.level] / 2) + [abilities.charisma.modifier] }}"], labels),
    ).toEqual({ ...charisma, classes: "Classes", ranger: "Ranger" });
  });

  test("are none of a value that's neither a path nor a template's", () => {
    expect(pickTargetLabels(["2", "{{ 1 + 2 }}"], labels)).toEqual({});
  });
});
