import { describe, expect, test } from "bun:test";

import { ClassPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { stripSeparators } from "@/shared/text.ts";
import { SKILL_NAMES } from "@/vocabulary/dnd3.5/skills.ts";

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

describe("A class's special prerequisite", () => {
  test("is read as one requirement, the prerequisites it lists that none reads unresolved", () => {
    const drunkenMaster = new ClassPrerequisites({
      special: ["Flurry of blows ability; evasion ability; must be chosen by existing drunken masters."],
    });
    expect(drunkenMaster.requirements).toEqual([eq("feats.flurryofblows.*.possessed")]);
    expect(drunkenMaster.unresolved).toEqual(["evasion ability"]);
  });

  test("naming a class feature nothing reads is unresolved, and a narrative one is dropped", () => {
    const enforcer = new ClassPrerequisites({
      special: [
        "Evasion class feature.Special: The character must undergo intensive training before she can gain the class abilities.",
      ],
    });
    expect(enforcer.requirements).toEqual([]);
    expect(enforcer.unresolved).toEqual(["Evasion class feature"]);
  });

  test("leaves out of the unresolved what the class requires otherwise", () => {
    const zealot = new ClassPrerequisites({
      casterLevel: [{ type: "divine", level: 2 }],
      special: [
        "Able to cast 2nd-level divine spells, Sneak attack damage +1d6, The character must worship the deity.",
      ],
    });
    expect(zealot.requirements).toEqual([gte("spellcasting.divine", 2), gte("feats.sneakattack.count", 1)]);
    expect(zealot.unresolved).toEqual([]);
  });
});
