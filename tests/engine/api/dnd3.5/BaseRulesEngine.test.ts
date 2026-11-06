import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

describe("3.5's content", () => {
  test("answers a class's level presets as its rules' level form gives them, by progression, in its order", () => {
    const presets = Engine.forRules(DND35_BASE_RULES).describeLevelPresets();
    const { tracks } = Engine.rules().describeAll()[DND35_BASE_RULES].progression;
    const formPresets = (key: string) =>
      (tracks.find((track) => track.key === key)?.presets ?? []).map((p) => [p.key, p.values]);
    expect(formPresets("bab")).toEqual(Object.entries(presets.bab));
    expect(formPresets("saves")).toEqual(Object.entries(presets.saves));
  });
});
