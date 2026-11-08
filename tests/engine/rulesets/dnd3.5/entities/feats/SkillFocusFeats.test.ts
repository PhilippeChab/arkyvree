import { describe, expect, test } from "bun:test";

import { SKILL_FOCUS_FEATS } from "@/content/dnd3.5/generated/srd/feats/feats.ts";
import SkillFocusFeats from "@/engine/rulesets/dnd3.5/entities/feats/SkillFocusFeats.ts";

describe("3.5's Skill Focus for a skill a ruleset adds", () => {
  test("is the SRD's seeded one: its name, its words and its +3", () => {
    const seeded = SKILL_FOCUS_FEATS.find(({ name }) => name === "Skill Focus: Bluff")!;
    const [made] = SkillFocusFeats.describe("Bluff");
    expect({ name: made.name, description: made.description }).toEqual({
      name: seeded.name,
      description: seeded.description,
    });
    expect(made.modifiers).toEqual(seeded.modifiers ?? []);
  });
});
