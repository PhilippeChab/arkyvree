import { describe, expect, test } from "bun:test";

import { anySkillRequirement, skillSlug } from "@/database/packages/dnd35-from-parser/tools/targets.ts";
import { gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

describe("A skill's slug", () => {
  test("is its own, or its base skill's for a specialization the skill list doesn't name", () => {
    expect(skillSlug("Knowledge (Arcana)")).toBe("knowledgearcana");
    expect(skillSlug("Perform (dance)")).toBe("perform");
    expect(skillSlug("Tumble")).toBe("tumble");
  });
});

describe("An any-skill requirement", () => {
  test("is the ranks in any skill the name covers", () => {
    const knowledge = SKILL_NAMES.filter((s) => s.startsWith("Knowledge"));
    expect(anySkillRequirement("Knowledge (any)", 8)).toEqual(
      or(...knowledge.map((s) => gte(`skills.${stripSeparators(s)}.rank`, 8))),
    );
    expect(anySkillRequirement("Tumble (any)", 4)).toEqual(gte("skills.tumble.rank", 4));
  });

  test("is none for a name that isn't an any-skill one, or covers no skill", () => {
    expect(anySkillRequirement("Knowledge (arcana)", 8)).toBeUndefined();
    expect(anySkillRequirement("Basketweaving (any)", 8)).toBeUndefined();
  });
});
