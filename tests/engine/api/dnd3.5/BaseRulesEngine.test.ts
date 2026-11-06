import { describe, expect, test } from "bun:test";

import { Engine } from "@/engine/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
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

describe("3.5's copy-on-write", () => {
  test("refuses the sources of a ruleset of other base rules, whose kinds it doesn't pair by", () => {
    const copyOnWrite = Engine.forRules(DND35_BASE_RULES).copyOnWrite();
    const sources = { extensionIds: ["extension"], id: "fork", parentId: "base" };
    expect(copyOnWrite.buildSourceChain({ ...sources, baseRules: DND35_BASE_RULES })).toEqual(["extension", "base"]);
    const other = { ...sources, baseRules: "Other rules" as BaseRules };
    const refusal = `A ruleset of Other rules is no ruleset of ${DND35_BASE_RULES}`;
    expect(() => copyOnWrite.buildSourceChain(other)).toThrow(refusal);
    expect(() => copyOnWrite.getReads(other)).toThrow(refusal);
  });
});
