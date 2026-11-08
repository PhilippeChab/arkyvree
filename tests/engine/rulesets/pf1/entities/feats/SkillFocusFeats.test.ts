import { describe, expect, test } from "bun:test";

import { SKILL_FOCUS_FEATS } from "@/content/pf1/generated/core-rulebook/feats/feats.ts";
import SkillFocusFeats from "@/engine/rulesets/pf1/entities/feats/SkillFocusFeats.ts";

describe("Pathfinder's Skill Focus for a skill a ruleset adds", () => {
  test("is the Core Rulebook's seeded one: its name and words, +3, and +6 from 10 ranks", () => {
    const seeded = SKILL_FOCUS_FEATS.find(({ name }) => name === "Skill Focus: Bluff")!;
    const [made] = SkillFocusFeats.describe("Bluff");
    expect({ name: made.name, description: made.description }).toEqual({
      name: seeded.name,
      description: seeded.description,
    });
    // The seeded one's two modifiers, +3 and +3 more from 10 ranks, as one whose template gives 3, then 6
    expect(made.modifiers).toEqual([
      {
        target: "skills.bluff.misc",
        operator: "add",
        value: "{{ 3 + 3 * min(1, max(0, [skills.bluff.rank] - 9)) }}",
        valueType: "number",
      },
    ]);
  });
});
