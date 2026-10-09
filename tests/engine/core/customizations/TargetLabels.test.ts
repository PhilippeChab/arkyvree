import { describe, expect, test } from "bun:test";

import TargetLabels from "@/engine/core/customizations/TargetLabels.ts";

describe("A target's labels", () => {
  const labels = {
    abilities: "Abilities",
    charisma: "Charisma",
    modifier: "Modifier",
    classes: "Classes",
    ranger: "Ranger",
  };

  test("are those of its path's segments that have one", () => {
    expect(TargetLabels.pick(["abilities.charisma.unknown"], labels)).toEqual({
      abilities: "Abilities",
      charisma: "Charisma",
    });
  });

  test("are those of a template's path, bare or bracketed, and of every path of an expression", () => {
    const charisma = { abilities: "Abilities", charisma: "Charisma", modifier: "Modifier" };
    expect(TargetLabels.pick(["{{ abilities.charisma.modifier }}"], labels)).toEqual(charisma);
    expect(TargetLabels.pick(["{{ [abilities.charisma.modifier] }}"], labels)).toEqual(charisma);
    expect(
      TargetLabels.pick(["{{ floor([classes.ranger.level] / 2) + [abilities.charisma.modifier] }}"], labels),
    ).toEqual({ ...charisma, classes: "Classes", ranger: "Ranger" });
  });

  test("are none of a value that's neither a path nor a template's", () => {
    expect(TargetLabels.pick(["2", "{{ 1 + 2 }}"], labels)).toEqual({});
  });
});
