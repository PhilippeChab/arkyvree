import { describe, expect, test } from "bun:test";

import { toSkillSlug } from "@/database/packages/dnd35-from-parser/tools/vocabulary/skills.ts";

describe("A skill's slug", () => {
  test("is its own, or its base skill's for a specialization the skill list doesn't name", () => {
    expect(toSkillSlug("Knowledge (Arcana)")).toBe("knowledgearcana");
    expect(toSkillSlug("Perform (dance)")).toBe("perform");
    expect(toSkillSlug("Tumble")).toBe("tumble");
  });
});
