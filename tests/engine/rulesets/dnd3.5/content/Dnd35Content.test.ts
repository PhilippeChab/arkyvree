import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

describe("3.5's content", () => {
  const content = Engine.forRules(DND35_BASE_RULES);

  test("requires a class level past the first to follow the class's previous level", () => {
    expect(content.planPositionRequirement("class-levels", "Arcane Archer", 5)).toEqual({
      level: "1",
      target: "classes.arcanearcher.level",
      operator: "greater_than",
      value: "4",
      valueType: "number",
    });
  });

  test("requires nothing of a class's first level", () => {
    expect(content.planPositionRequirement("class-levels", "Fighter", 1)).toBeUndefined();
  });
});
