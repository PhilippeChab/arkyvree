import { describe, expect, test } from "bun:test";

import { buildAnySkillRequirement, toSkillSlug } from "@/database/packages/dnd35-from-parser/tools/targets.ts";
import { gte, or } from "@/database/packages/dnd35/content/customization/requirements.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

describe("A skill's slug", () => {
  test("is its own, or its base skill's for a specialization the skill list doesn't name", () => {
    expect(toSkillSlug("Knowledge (Arcana)")).toBe("knowledgearcana");
    expect(toSkillSlug("Perform (dance)")).toBe("perform");
    expect(toSkillSlug("Tumble")).toBe("tumble");
  });
});

describe("An any-skill requirement", () => {
  test("is the ranks in any skill the name covers", () => {
    const knowledge = SKILL_NAMES.filter((s) => s.startsWith("Knowledge"));
    expect(buildAnySkillRequirement("Knowledge (any)", 8)).toEqual(
      or(...knowledge.map((s) => gte(`skills.${stripSeparators(s)}.rank`, 8))),
    );
    expect(buildAnySkillRequirement("Tumble (any)", 4)).toEqual(gte("skills.tumble.rank", 4));
  });

  test("is none for a name that isn't an any-skill one, or covers no skill", () => {
    expect(buildAnySkillRequirement("Knowledge (arcana)", 8)).toBeUndefined();
    expect(buildAnySkillRequirement("Basketweaving (any)", 8)).toBeUndefined();
  });
});
