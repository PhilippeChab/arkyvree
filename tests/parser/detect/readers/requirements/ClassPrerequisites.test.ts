import { describe, expect, test } from "bun:test";

import { ClassPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { gte, or } from "@/content/dnd3.5/builders/customization/requirements.ts";
import { SKILL_NAMES } from "@/content/dnd3.5/data/skills.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The requirements of a class whose prerequisites ask for `ranks` in a skill named `name`. */
function skillRequirements(name: string, ranks: number) {
  return new ClassPrerequisites({ skills: [{ name, ranks }] }).requirements;
}

describe("A class's skill prerequisite", () => {
  test("of any skill of a family is the ranks in any skill the name covers", () => {
    const knowledge = SKILL_NAMES.filter((s) => s.startsWith("Knowledge"));
    expect(skillRequirements("Knowledge (any)", 8)).toEqual([
      or(...knowledge.map((s) => gte(`skills.${stripSeparators(s)}.rank`, 8))),
    ]);
    expect(skillRequirements("Tumble (any)", 4)).toEqual([gte("skills.tumble.rank", 4)]);
  });

  test("of a skill that isn't a family's is its own ranks, and of a family that covers no skill an invalid path", () => {
    expect(skillRequirements("Knowledge (arcana)", 8)).toEqual([gte("skills.knowledgearcana.rank", 8)]);
    const basketweaving = new ClassPrerequisites({ skills: [{ name: "Basketweaving (any)", ranks: 8 }] });
    expect(basketweaving.requirements).toEqual([]);
    expect(basketweaving.errors).toEqual(['Invalid requirement path: "skills.basketweaving.rank"']);
  });
});
